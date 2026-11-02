/* global document, window */
const player = document.querySelector('audio');
const stopListening = window.kronoAudio.listen(async ({ id, volume }) => {
  let done = false;
  const finish = (status) => {
    if (done) return;
    done = true;
    player.pause();
    player.onended = null;
    player.onerror = null;
    window.kronoAudio.result({ id, status });
  };
  player.onended = () => finish('finished');
  player.onerror = () => finish('failed');
  try {
    player.volume = volume;
    player.currentTime = 0;
    await player.play();
  } catch {
    finish('failed');
  }
});

window.addEventListener('pagehide', stopListening, { once: true });
