"""
prepare-bookshop.py: turn the raw Bookshop workbook into the app's sales CSV.

This is the minimal "upstream prep tool" from D-010: the app expects a clean, typed CSV,
so cleaning and joining happen here, once, in a script anyone can rerun and read.

Run:    npm run prep:bookshop      (or: python scripts/prepare-bookshop.py)
Input:  data/raw/Bookshop.xlsx     (fictional bookshop data; sales are dated in 2193)
Output: src/data/bookshop-sales.csv, one row per item sold
        src/data/bookshop-sales.roles.json, the role of each CSV column (see step 6)

Steps:
 1. Read the workbook with Python's standard library only (an .xlsx file is a zip of XML
    sheets), so no package has to be installed.
 2. Read the lookup sheets and check each key is unique (a duplicate key would make a join
    ambiguous, so the script stops):
      Edition   by ISBN       -> BookID, Format, PubID, Price
      Book      by BookID     -> Title, AuthID
      Info      by BookID1 + BookID2 (the ID is split across two columns, e.g. "MM" + "424"
                = "MM424")    -> Genre, SeriesID (empty for books not in a series)
      Author    by AuthID     -> First Name, Last Name, Country of Residence
      Publisher by PubID      -> Publishing House
      Series    by SeriesID   -> Series Name
    Award is read as a set of titles, not a lookup: one book can win more than one award
    (The Mallemaroking appears twice), so a repeated title is expected there. Every Award
    title must match a Book title, or the script stops.
 3. Read Sales Q1-Q4. Each row is one item sold. ItemIDs are reported if they repeat but
    the rows are kept: in this file two ItemIDs each appear on two different orders
    (different OrderIDs), which looks like an ID collision rather than a copied row, and the
    expected 56,350 counts both.
    For each row, join Sale -> Edition (ISBN) -> Book (BookID) -> Info (BookID) ->
    Author (AuthID) and Publisher (PubID), and Info -> Series (SeriesID) when Info has one.
    Any key that doesn't match stops the script, listing the first failures: nothing is
    dropped silently.
 4. Convert values:
      sale date: an Excel day number (1900 date system) -> ISO date, e.g. 2193-01-02
      discount:  empty -> 0; must be between 0 and 1
      price:     must be a positive number
      revenue:   price x (1 - discount), rounded to the cent
      author:    First Name + " " + Last Name; both must be present
      award winner: "yes" if the title is in the Award sheet, else "no"
      series:    Series Name, or empty if the book is not in a series
      book id:   the BookID from Edition, e.g. MM424
 5. Write the CSV (columns: sale date, title, genre, format, publisher, author country,
    price, discount, revenue, author, award winner, series, book id), print row counts per
    quarter and in total, and check the total against the expected 56,350. Empty series
    values are reported on their own line, since they mean "not in a series".
 6. Write the roles file: one role per CSV column (money, price, rate, date, category,
    entity, flag, id). The script stops if its keys aren't exactly the CSV's columns.
"""

import csv
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "raw" / "Bookshop.xlsx"
OUTPUT = ROOT / "src" / "data" / "bookshop-sales.csv"
ROLES_OUTPUT = ROOT / "src" / "data" / "bookshop-sales.roles.json"
EXPECTED_ROWS = 56_350
SALES_SHEETS = ["Sales Q1", "Sales Q2", "Sales Q3", "Sales Q4"]
COLUMNS = [
    "sale date", "title", "genre", "format", "publisher", "author country", "price", "discount", "revenue",
    "author", "award winner", "series", "book id",
]
# What each column is, for the app: money is summed, price and rate are averaged, id is
# counted but never charted or checked for concentration.
ROLES = {
    "sale date": "date",
    "title": "entity",
    "genre": "category",
    "format": "category",
    "publisher": "category",
    "author country": "category",
    "price": "price",
    "discount": "rate",
    "revenue": "money",
    "author": "entity",
    "award winner": "flag",
    "series": "category",
    "book id": "id",
}

# Not included: Publisher."Marketing Spend" and the Ratings sheet.
#   Marketing Spend is one value per publisher (4 values, 48,000 to 2,320,000), with no
#   period or currency in the sheet.
#   Ratings has one row per review (50,330 rows, several per book), not per sale.
#   Neither has one value per sale row.
#   Why: TODO(adam)

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
# Excel's 1900 date system counts days from 1899-12-30 (this workbook doesn't use the
# 1904 system; the script checks).
EXCEL_EPOCH = date(1899, 12, 30)


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------------------
# Step 1: reading the workbook


class Workbook:
    def __init__(self, path: Path):
        if not path.exists():
            fail(f"{path} not found.")
        self.zip = zipfile.ZipFile(path)
        workbook = ET.fromstring(self.zip.read("xl/workbook.xml"))
        props = workbook.find(f"{NS}workbookPr")
        if props is not None and props.get("date1904") in ("1", "true"):
            fail("This workbook uses the 1904 date system; the date conversion assumes 1900.")
        rels = ET.fromstring(self.zip.read("xl/_rels/workbook.xml.rels"))
        targets = {r.get("Id"): r.get("Target") for r in rels}
        self.sheets = {}
        for sheet in workbook.find(f"{NS}sheets"):
            target = targets[sheet.get(REL_ID)].lstrip("/")
            self.sheets[sheet.get("name")] = target if target.startswith("xl/") else f"xl/{target}"
        # Text cells store an index into one shared list of strings.
        strings = ET.fromstring(self.zip.read("xl/sharedStrings.xml"))
        self.shared = ["".join(t.text or "" for t in si.iter(f"{NS}t")) for si in strings.findall(f"{NS}si")]

    def table(self, name: str) -> list[dict[str, str]]:
        """A sheet as a list of {header: value} dicts. Empty cells are missing from the dict."""
        if name not in self.sheets:
            fail(f'Sheet "{name}" not found. Sheets: {", ".join(self.sheets)}')
        rows = []
        header: dict[str, str] | None = None
        # iterparse reads the sheet row by row instead of loading all of it at once.
        for _, el in ET.iterparse(self.zip.open(self.sheets[name])):
            if el.tag != f"{NS}row":
                continue
            cells = {}
            for c in el.findall(f"{NS}c"):
                column = re.match(r"[A-Z]+", c.get("r")).group()
                kind = c.get("t")
                if kind == "inlineStr":
                    value = "".join(t.text or "" for t in c.iter(f"{NS}t"))
                else:
                    v = c.find(f"{NS}v")
                    if v is None or v.text is None:
                        continue
                    value = self.shared[int(v.text)] if kind == "s" else v.text
                value = value.strip()
                if value != "":
                    cells[column] = value
            el.clear()
            if header is None:
                header = cells
                continue
            if cells:
                rows.append({header[col]: val for col, val in cells.items() if col in header})
        print(f"  read {name}: {len(rows):,} rows")
        return rows


# ---------------------------------------------------------------------------------------
# Step 2: lookups with unique keys


def index(rows: list[dict[str, str]], key, sheet: str) -> dict[str, dict[str, str]]:
    """Rows keyed by `key` (a column name or a function). Missing or duplicate keys stop the script."""
    get = key if callable(key) else (lambda r: r.get(key))
    out: dict[str, dict[str, str]] = {}
    for n, row in enumerate(rows, start=2):  # row 1 is the header
        k = get(row)
        if not k:
            fail(f"{sheet} row {n} has no key.")
        if k in out:
            fail(f'{sheet} has the key "{k}" twice, so a join on it would be ambiguous.')
        out[k] = row
    return out


def info_id(row: dict[str, str]) -> str | None:
    # Info splits the BookID in two ("MM", "424"). Joined, it matches Book's "MM424".
    first, second = row.get("BookID1"), row.get("BookID2")
    return f"{first}{second}" if first and second else None


# ---------------------------------------------------------------------------------------
# Step 4 helpers: value conversion


def to_number(text: str | None, what: str, where: str) -> float:
    try:
        return float(text)
    except (TypeError, ValueError):
        fail(f"{where}: {what} is not a number ({text!r}).")


def to_iso(serial: str, where: str) -> str:
    day = to_number(serial, "sale date", where)
    if day != int(day):
        fail(f"{where}: sale date {serial} has a time part; expected whole days.")
    return (EXCEL_EPOCH + timedelta(days=int(day))).isoformat()


def plain(x: float, places: int) -> str:
    """A number without float noise or trailing zeros: 27.99, 0.15, 0."""
    text = f"{round(x, places):.{places}f}".rstrip("0").rstrip(".")
    return text or "0"


# ---------------------------------------------------------------------------------------


def main() -> None:
    print(f"Reading {SOURCE.relative_to(ROOT)}")
    book = Workbook(SOURCE)

    editions = index(book.table("Edition"), "ISBN", "Edition")
    books = index(book.table("Book"), "BookID", "Book")
    infos = index(book.table("Info"), info_id, "Info")
    authors = index(book.table("Author"), "AuthID", "Author")
    publishers = index(book.table("Publisher"), "PubID", "Publisher")
    series_names = index(book.table("Series"), "SeriesID", "Series")

    book_titles = {row["Title"] for row in books.values() if "Title" in row}
    award_titles: set[str] = set()
    for n, row in enumerate(book.table("Award"), start=2):
        title = row.get("Title")
        if title not in book_titles:
            fail(f"Award row {n}: title {title!r} doesn't match any Book title.")
        award_titles.add(title)

    out_rows: list[list[str]] = []
    unmatched: list[str] = []
    missing: dict[str, int] = {c: 0 for c in COLUMNS}
    item_ids: set[str] = set()
    repeated_items: list[str] = []
    per_sheet: dict[str, int] = {}

    def lookup(table: dict, key: str | None, name: str, where: str):
        row = table.get(key) if key else None
        if row is None:
            unmatched.append(f"{where}: no {name} for {key!r}")
        return row

    for sheet in SALES_SHEETS:
        sales = book.table(sheet)
        per_sheet[sheet] = len(sales)
        for n, sale in enumerate(sales, start=2):
            where = f"{sheet} row {n}"
            item = sale.get("ItemID")
            if not item:
                fail(f"{where} has no ItemID.")
            if item in item_ids:
                repeated_items.append(f"{item} ({where}, order {sale.get('OrderID')})")
            item_ids.add(item)

            edition = lookup(editions, sale.get("ISBN"), "Edition", where)
            if edition is None:
                continue
            title_row = lookup(books, edition.get("BookID"), "Book", where)
            info = lookup(infos, edition.get("BookID"), "Info", where)
            publisher = lookup(publishers, edition.get("PubID"), "Publisher", where)
            author = lookup(authors, title_row.get("AuthID"), "Author", where) if title_row else None
            series = lookup(series_names, info.get("SeriesID"), "Series", where) if info and "SeriesID" in info else {}
            if None in (title_row, info, publisher, author, series):
                continue
            if not author.get("First Name") or not author.get("Last Name"):
                fail(f"Author {author['AuthID']} is missing a first or last name.")

            price = to_number(edition.get("Price"), "price", f"Edition {edition['ISBN']}")
            if price <= 0:
                fail(f"Edition {edition['ISBN']}: price must be positive, got {price}.")
            discount = to_number(sale["Discount"], "discount", where) if "Discount" in sale else 0.0
            if not 0 <= discount < 1:
                fail(f"{where}: discount {discount} is outside 0 to 1.")
            revenue = round(price * (1 - discount), 2)

            values = [
                to_iso(sale.get("Sale Date"), where),
                title_row.get("Title", ""),
                info.get("Genre", ""),
                edition.get("Format", ""),
                publisher.get("Publishing House", ""),
                author.get("Country of Residence", ""),
                plain(price, 2),
                plain(discount, 4),
                plain(revenue, 2),
                f"{author['First Name']} {author['Last Name']}",
                "yes" if title_row.get("Title") in award_titles else "no",
                series.get("Series Name", ""),
                edition["BookID"],
            ]
            for col, value in zip(COLUMNS, values):
                if value == "":
                    missing[col] += 1
            out_rows.append(values)

    if unmatched:
        shown = "\n  ".join(unmatched[:10])
        fail(f"{len(unmatched):,} sales rows have a key that doesn't match:\n  {shown}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(COLUMNS)
        writer.writerows(out_rows)

    if list(ROLES) != COLUMNS:
        fail(f"The roles must name exactly the CSV's columns, in order. Roles: {list(ROLES)}")
    ROLES_OUTPUT.write_text(json.dumps(ROLES, indent=2) + "\n", encoding="utf-8")

    print("\nSales rows per sheet:")
    for sheet, count in per_sheet.items():
        print(f"  {sheet}: {count:,}")
    print(f"  total: {len(out_rows):,} rows written to {OUTPUT.relative_to(ROOT)}")
    if repeated_items:
        print(f"ItemIDs seen before (rows kept): {len(repeated_items)}")
        for r in repeated_items:
            print(f"  {r}")
    print(f"Roles written to {ROLES_OUTPUT.relative_to(ROOT)}")
    not_in_series = missing.pop("series")
    print(f"Empty series (books not in a series): {not_in_series:,} rows")
    gaps = {c: n for c, n in missing.items() if n}
    print(f"Empty values (kept as missing, not filled in): {gaps or 'none'}")
    if len(out_rows) != EXPECTED_ROWS:
        fail(f"Expected {EXPECTED_ROWS:,} rows, wrote {len(out_rows):,}. Check the source file.")
    print("All joins matched; row count as expected.")


if __name__ == "__main__":
    main()
