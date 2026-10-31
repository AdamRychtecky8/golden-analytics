import { useState } from 'react';
import { MAX_ASK_CHARS, describeSpec, reframeOf, type AskResult } from '../ask';
import { ASK_TEXT } from '../askText';
import type { ChartView } from '../paths';
import type { DataProfile } from '../profile';
import type { Roles } from '../roles';

interface AskBoxProps {
  ai: boolean | undefined; // whether the server has an AI key
  profile: DataProfile;
  roles: Roles;
  ask: (text: string) => Promise<AskResult>;
  onUse: (spec: ChartView, asked: { text: string; reframe: 'causal' | 'forecast' | null }) => void;
}

/**
 * "Ask your own question" (SPEC "Prompt-a-path"). The AI only translates the question; code
 * decides the result and writes every message (ask.ts). Nothing is built until the user
 * clicks "Use this": the translated chart is shown in plain words first.
 */
export function AskBox({ ai, profile, roles, ask, onUse }: AskBoxProps) {
  const [text, setText] = useState('');
  const [asked, setAsked] = useState(''); // the text the shown result answers
  const [result, setResult] = useState<AskResult | null>(null);
  const [pending, setPending] = useState(false);
  const off = ai !== true;

  async function submit() {
    const q = text.trim();
    if (!q || pending || off) return;
    setPending(true);
    setResult(null);
    const r = await ask(q);
    setAsked(q);
    setResult(r);
    setPending(false);
  }

  const cancel = () => setResult(null);
  const use = (spec: ChartView) => {
    onUse(spec, { text: asked, reframe: result ? reframeOf(result) : null });
    setResult(null);
    setText('');
  };
  const plain = (spec: ChartView) => describeSpec(spec, profile, roles);

  return (
    <div className="ask-box">
      <label className="label" htmlFor="ask-input">
        Ask your own question
      </label>
      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input id="ask-input" type="text" value={text} maxLength={MAX_ASK_CHARS} disabled={off} placeholder={off ? '' : 'e.g. Revenue by genre for hardcovers'} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn" disabled={off || pending || text.trim() === ''}>
          {pending ? '…' : 'Ask'}
        </button>
      </form>
      {ai === false && <p className="notice">{ASK_TEXT.noKey}</p>}

      {result && (
        <div className="ask-result" role="status">
          {result.kind !== 'refuse' && <span className="label">{ASK_TEXT.label}</span>}
          {'message' in result && <p className="ask-message">{result.message}</p>}
          {result.kind === 'clarify' ? (
            <ul className="ask-choices">
              {result.candidates.map((c) => (
                <li key={JSON.stringify(c)}>
                  <span>{plain(c)}</span>
                  <button type="button" className="btn btn-primary" onClick={() => use(c)}>
                    Use this
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            result.spec && <p className="ask-spec">{plain(result.spec)}</p>
          )}
          <div className="ask-actions">
            {result.kind !== 'clarify' && result.spec && (
              <button type="button" className="btn btn-primary" onClick={() => use(result.spec!)}>
                Use this
              </button>
            )}
            <button type="button" className="btn" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
