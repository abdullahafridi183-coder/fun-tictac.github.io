(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const cells = [...document.querySelectorAll(".cell")];

  const state = {
    board: Array(9).fill(""),
    current: "X",
    mode: localStorage.getItem("tta-mode") || "ai",
    difficulty: localStorage.getItem("tta-difficulty") || "medium",
    scores: JSON.parse(localStorage.getItem("tta-scores") || '{"X":0,"O":0,"draw":0}'),
    sound: localStorage.getItem("tta-sound") !== "off",
    theme: localStorage.getItem("tta-theme") || "dark",
    gameOver: false,
    aiTimer: null
  };

  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  let audioCtx;

  function beep(type = "tap") {
    if (!state.sound) return;
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    const settings = {
      tap: [520, .055, "sine"],
      win: [740, .16, "triangle"],
      lose: [180, .18, "sawtooth"],
      draw: [330, .12, "sine"]
    }[type] || [520,.06,"sine"];
    osc.type = settings[2];
    osc.frequency.setValueAtTime(settings[0], now);
    osc.frequency.exponentialRampToValueAtTime(settings[0] * (type === "win" ? 1.45 : .78), now + settings[1]);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.09, now + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, now + settings[1]);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + settings[1] + .02);
  }

  function save() {
    localStorage.setItem("tta-scores", JSON.stringify(state.scores));
    localStorage.setItem("tta-mode", state.mode);
    localStorage.setItem("tta-difficulty", state.difficulty);
    localStorage.setItem("tta-sound", state.sound ? "on" : "off");
    localStorage.setItem("tta-theme", state.theme);
  }

  function updateUI() {
    $("#scoreX").textContent = state.scores.X;
    $("#scoreO").textContent = state.scores.O;
    $("#scoreDraw").textContent = state.scores.draw;
    $("#modalX").textContent = state.scores.X;
    $("#modalO").textContent = state.scores.O;
    $("#modalDraw").textContent = state.scores.draw;

    $("#difficultyWrap").style.display = state.mode === "ai" ? "" : "none";
    $("#xName").textContent = "YOU";
    $("#oName").textContent = state.mode === "ai" ? "AI" : "PLAYER";

    document.querySelectorAll(".mode-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === state.mode);
    });

    $("#difficulty").value = state.difficulty;
    $("#soundBtn").textContent = state.sound ? "🔊" : "🔇";
    $("#themeBtn").textContent = state.theme === "dark" ? "☀️" : "🌙";
    document.documentElement.dataset.theme = state.theme;

    const pillDot = $("#turnPill .turn-dot");
    pillDot.className = "turn-dot " + state.current.toLowerCase();
    $("#turnPill").lastChild.textContent = state.current;
  }

  function getResult(board = state.board) {
    for (const combo of wins) {
      const [a,b,c] = combo;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], combo };
      }
    }
    return board.every(Boolean) ? { winner: "draw", combo: [] } : null;
  }

  function render() {
    cells.forEach((cell, i) => {
      cell.textContent = state.board[i];
      cell.className = "cell";
      if (state.board[i]) cell.classList.add(state.board[i].toLowerCase());
      cell.disabled = Boolean(state.board[i]) || state.gameOver ||
        (state.mode === "ai" && state.current === "O");
      cell.setAttribute("aria-label", state.board[i] ? `Cell ${i + 1}, ${state.board[i]}` : `Cell ${i + 1}, empty`);
    });

    const result = getResult();
    if (!state.gameOver) {
      $("#statusText").textContent =
        state.mode === "ai" && state.current === "O" ? "AI is thinking…" :
        state.current === "X" ? "Your turn" : "Player O's turn";
    }
    updateUI();

    if (result?.winner !== "draw" && result) {
      result.combo.forEach(i => cells[i].classList.add("win"));
      drawWinLine(result.combo);
    }
  }

  function drawWinLine(combo) {
    const board = $("#board");
    const line = $("#winLine");
    const first = cells[combo[0]].getBoundingClientRect();
    const last = cells[combo[2]].getBoundingClientRect();
    const parent = board.getBoundingClientRect();

    const x1 = first.left + first.width / 2 - parent.left;
    const y1 = first.top + first.height / 2 - parent.top;
    const x2 = last.left + last.width / 2 - parent.left;
    const y2 = last.top + last.height / 2 - parent.top;
    const length = Math.hypot(x2-x1, y2-y1);
    const angle = Math.atan2(y2-y1, x2-x1) * 180 / Math.PI;

    line.style.left = `${x1}px`;
    line.style.top = `${y1 - 2.5}px`;
    line.style.width = `${length}px`;
    line.style.transform = `rotate(${angle}deg)`;
    line.classList.add("show");
  }

  function clearWinLine() {
    const line = $("#winLine");
    line.classList.remove("show");
    line.style.width = "0";
  }

  function makeMove(index, player) {
    if (state.board[index] || state.gameOver) return false;
    state.board[index] = player;
    beep("tap");
    render();

    const result = getResult();
    if (result) {
      finish(result);
      return true;
    }
    state.current = player === "X" ? "O" : "X";
    render();

    if (state.mode === "ai" && state.current === "O") {
      clearTimeout(state.aiTimer);
      state.aiTimer = setTimeout(aiMove, 380);
    }
    return true;
  }

  function finish(result) {
    state.gameOver = true;
    if (result.winner === "draw") {
      state.scores.draw++;
      $("#statusText").textContent = "Round drawn";
      beep("draw");
      showModal("draw");
    } else {
      state.scores[result.winner]++;
      const humanWon = state.mode === "ai" && result.winner === "X";
      $("#statusText").textContent =
        state.mode === "ai"
          ? (humanWon ? "You won!" : "AI wins")
          : `${result.winner} wins!`;
      beep(humanWon || (state.mode === "local" && result.winner === "X") ? "win" : "lose");
      showModal(result.winner);
    }
    save();
    render();
  }

  function showModal(result) {
    const title = $("#resultTitle");
    const message = $("#resultMessage");
    const icon = $("#resultIcon");
    if (result === "draw") {
      title.textContent = "It's a Draw";
      message.textContent = "Perfectly matched. Run it back.";
      icon.textContent = "＝";
    } else if (state.mode === "ai" && result === "X") {
      title.textContent = "You Win!";
      message.textContent = "Great strategy. Can you do it again?";
      icon.textContent = "✦";
    } else if (state.mode === "ai") {
      title.textContent = "AI Wins";
      message.textContent = "The arena got the better of that round.";
      icon.textContent = "◎";
    } else {
      title.textContent = `Player ${result} Wins!`;
      message.textContent = "Nice finish. Start another round.";
      icon.textContent = result;
    }
    $("#resultModal").hidden = false;
  }

  function newRound() {
    clearTimeout(state.aiTimer);
    state.board = Array(9).fill("");
    state.current = "X";
    state.gameOver = false;
    $("#resultModal").hidden = true;
    clearWinLine();
    render();
  }

  function resetMatch() {
    state.scores = {X:0,O:0,draw:0};
    save();
    newRound();
  }

  function emptyIndices(board) {
    return board.map((v,i) => v ? null : i).filter(i => i !== null);
  }

  function randomMove() {
    const empty = emptyIndices(state.board);
    return empty[Math.floor(Math.random() * empty.length)];
  }

  function findWinningMove(board, player) {
    for (const i of emptyIndices(board)) {
      board[i] = player;
      const result = getResult(board);
      board[i] = "";
      if (result?.winner === player) return i;
    }
    return null;
  }

  function mediumMove() {
    const win = findWinningMove(state.board, "O");
    if (win !== null) return win;
    const block = findWinningMove(state.board, "X");
    if (block !== null) return block;
    if (!state.board[4]) return 4;
    const corners = [0,2,6,8].filter(i => !state.board[i]);
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
    return randomMove();
  }

  function minimax(board, maximizing) {
    const result = getResult(board);
    if (result?.winner === "O") return 10;
    if (result?.winner === "X") return -10;
    if (result?.winner === "draw") return 0;

    if (maximizing) {
      let best = -Infinity;
      for (const i of emptyIndices(board)) {
        board[i] = "O";
        best = Math.max(best, minimax(board, false));
        board[i] = "";
      }
      return best;
    }
    let best = Infinity;
    for (const i of emptyIndices(board)) {
      board[i] = "X";
      best = Math.min(best, minimax(board, true));
      board[i] = "";
    }
    return best;
  }

  function hardMove() {
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const i of emptyIndices(state.board)) {
      state.board[i] = "O";
      const score = minimax(state.board, false);
      state.board[i] = "";
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [i];
      } else if (score === bestScore) {
        bestMoves.push(i);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function aiMove() {
    if (state.gameOver || state.current !== "O" || state.mode !== "ai") return;
    let index;
    if (state.difficulty === "easy") index = randomMove();
    else if (state.difficulty === "medium") index = mediumMove();
    else index = hardMove();
    makeMove(index, "O");
  }

  cells.forEach(cell => {
    cell.addEventListener("click", () => {
      const index = Number(cell.dataset.index);
      if (state.mode === "ai" && state.current !== "X") return;
      makeMove(index, state.current);
    });
  });

  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      save();
      newRound();
    });
  });

  $("#difficulty").addEventListener("change", e => {
    state.difficulty = e.target.value;
    save();
    newRound();
  });

  $("#newRound").addEventListener("click", newRound);
  $("#modalNewRound").addEventListener("click", newRound);
  $("#resetMatch").addEventListener("click", resetMatch);

  $("#resetScore").addEventListener("click", () => {
    if (confirm("Reset all statistics?")) resetMatch();
  });

  $("#soundBtn").addEventListener("click", () => {
    state.sound = !state.sound;
    save();
    updateUI();
    if (state.sound) beep("tap");
  });

  $("#themeBtn").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    save();
    updateUI();
  });

  $("#resultModal").addEventListener("click", e => {
    if (e.target.id === "resultModal") newRound();
  });

  window.addEventListener("resize", () => {
    const result = getResult();
    if (result?.winner !== "draw" && result) drawWinLine(result.combo);
  });

  $("#year").textContent = new Date().getFullYear();
  updateUI();
  render();
})();
