// 複数の曲が同時に鳴らないよう、再生中の曲以外を自動停止します。
const players = [...document.querySelectorAll("audio")];

players.forEach((currentPlayer) => {
  currentPlayer.addEventListener("play", () => {
    players.forEach((otherPlayer) => {
      if (otherPlayer !== currentPlayer) {
        otherPlayer.pause();
      }
    });
  });
});

// フッターの年を現在の年に合わせます。
const yearElement = document.querySelector("#current-year");

if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}
