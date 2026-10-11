import { useState } from "react";
import { analyze } from "./analyze";
import { presets } from "./cron/presets";

export interface AppProps {
  initialExpression?: string;
}

export function App({ initialExpression = "*/15 * * * *" }: AppProps = {}) {
  const [expression, setExpression] = useState(initialExpression);
  const result = analyze(expression);
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <main>
      <h1>Cronsay</h1>
      <p>Explain a cron expression and see when it runs in your local time zone.</p>

      <label htmlFor="cron-expression">Cron expression</label>
      <input
        id="cron-expression"
        type="text"
        value={expression}
        onChange={(event) => setExpression(event.target.value)}
        aria-invalid={!result.ok}
        aria-describedby={result.ok ? "cron-hint" : "cron-hint cron-error"}
        autoComplete="off"
        spellCheck={false}
      />
      <p id="cron-hint" className="hint">
        Five fields: minute, hour, day of month, month, day of week. For example: */15 * * * * or 0
        9 * * MON-FRI.
      </p>

      <section aria-labelledby="presets-heading">
        <h2 id="presets-heading">Example presets</h2>
        <div className="presets">
          {presets.map((preset) => (
            <button
              key={preset.expression}
              type="button"
              onClick={() => setExpression(preset.expression)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <div aria-live="polite">
        {!result.ok ? (
          <p id="cron-error" role="alert">
            {result.error}
          </p>
        ) : (
          <section aria-labelledby="description-heading">
            <h2 id="description-heading">Description</h2>
            <p id="description">{result.description}</p>
            <h2>Upcoming runs</h2>
            <p className="hint">Times are shown in your local time zone.</p>
            {result.runs.length === 0 ? (
              <p>No upcoming runs found within the search window.</p>
            ) : (
              <ol aria-label="Upcoming runs">
                {result.runs.map((run) => (
                  <li key={run.toISOString()}>
                    <time dateTime={run.toISOString()}>{formatter.format(run)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

export default App;
