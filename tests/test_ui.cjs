// Preserve the original test entry point; exercise the extracted real modules.
(async()=>{
  await import('./test_flight_state.mjs');
  await import('./test_scene.mjs');
})().catch(error=>{console.error(error);process.exitCode=1;});
