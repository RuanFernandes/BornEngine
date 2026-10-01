interface SandboxDocsProps {
  readonly active: boolean;
}

const sample = `export default {
  onStart(ctx: BornEngineScriptContext) {
    ctx.log?.('Client script ready');
    ctx.particles?.emitBurst(12, 0, -1);
  },

  update(ctx: BornEngineScriptContext, dt: number) {
    // Add client-side effects here.
  },
} satisfies BornEngineScriptBehavior;`;

export function SandboxDocs({ active }: SandboxDocsProps) {
  return (
    <section className="editor-view docs-view" aria-label="Sandbox documentation" hidden={!active}>
      <div className="panel-heading">
        <div><p className="eyebrow">SANDBOX GUIDE</p><h1>Build safely inside the sandbox.</h1></div>
        <span className="language-badge">Quick start</span>
      </div>
      <div className="docs-scroll">
        <p className="docs-lead">Edit, validate, and share game behavior from one local workspace. The editor keeps client scripts and authoritative server rules on separate paths.</p>
        <article className="docs-card">
          <h2>Client scripts</h2>
          <p>Client scripts run in the game client's isolated QuickJS runtime. They can read their own player context, log messages, and emit local particles. They cannot load modules or change server-owned positions.</p>
          <pre><code>{sample}</code></pre>
          <p>Use <strong>Run</strong> for this preview only. Use <strong>Share script</strong> to send TypeScript to the scripting manager room for validation and a revisioned update.</p>
        </article>
        <article className="docs-card">
          <h2>Scripting manager</h2>
          <p>The <code>scripting-manager</code> Colyseus room checks each script before accepting it. It increments the shared revision only for valid TypeScript, then sends the compiled module to connected game clients. Clients keep the last working script if local installation fails.</p>
          <p>The shared script is held in memory for this example room. It resets when the room/server is recreated. Everyone who connects to the example may publish, so use it only on a trusted local network.</p>
        </article>
        <article className="docs-card">
          <h2>Server rules</h2>
          <p>Server rules run inside the Colyseus server and own movement speed, player hooks, messages, and timed rules. Saving a valid update stages it first, then swaps every active room together. An invalid update leaves the previous rules running.</p>
          <p>The local file editor stores files under <code>server/scripts/</code>. Its development API binds to loopback and is disabled in production. It has no login or token because it is intended only for this local game example.</p>
        </article>
        <article className="docs-card docs-card-compact">
          <h2>Multiplayer and native play</h2>
          <p><code>sandbox</code> owns authoritative player state. <code>scripting-manager</code> owns validated shared scripts. Run two native clients against <code>ws://127.0.0.1:2568</code> to see movement and accepted script revisions without relying on browser WebGPU.</p>
        </article>
      </div>
    </section>
  );
}
