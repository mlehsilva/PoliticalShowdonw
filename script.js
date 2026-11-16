
const canvas = document.getElementById("tela");
const ctx = canvas.getContext("2d");

const DURACAO = 150;
const BPM = 120;
const BEAT = 60 / BPM;
const PENALIDADE_ERRO = 6;

const SETAS = ["←", "↓", "↑", "→"];
const CORES = ["#c24cf6", "#00c8ff", "#12e04a", "#ff3b3b"];

const TECLAS = {
  ArrowLeft: 0,
  ArrowDown: 1,
  ArrowUp: 2,
  ArrowRight: 3
};

const MAPAS = {
  wasd: { a: 0, s: 1, w: 2, d: 3 },
  dfjk: { d: 0, f: 1, j: 2, k: 3 }
};

const CONFIG = {
  facil: {
    velocidade: 280,
    passo: 1,
    chance: 0.65,
    recuperacao: 2,
    tolerancia: 0.19
  },
  normal: {
    velocidade: 390,
    passo: 0.5,
    chance: 0.82,
    recuperacao: 1.5,
    tolerancia: 0.15
  },
  dificil: {
    velocidade: 540,
    passo: 0.25,
    chance: 0.94,
    recuperacao: 1,
    tolerancia: 0.11
  }
};

let personagem = "lula";
let esquemaControles = "setas";
let dificuldade = "facil";
let config = CONFIG.facil;


const PERSONAGENS = {
  lula: {
    nome: "LULA",
    cor: "#d1001c",
    corClara: "#ff4545",
    roupa: "#d1001c",
    cabelo: "#eeeeee"
  },

  flavio: {
    nome: "FLÁVIO",
    cor: "#174dba",
    corClara: "#4595ff",
    roupa: "#17233d",
    cabelo: "#302018"
  },

  trump: {
    nome: "TRUMP",
    cor: "#1745a0",
    corClara: "#4595ff",
    roupa: "#173b85",
    cabelo: "#e6b94c"
  }
};


let jogador = PERSONAGENS.lula;
let inimigo = PERSONAGENS.flavio;

let estado = "inicio";
let notas = [];
let pontos = 0;
let combo = 0;
let energia = 65;
let recorde = Number(localStorage.getItem("debateRecorde")) || 0;

let inicioTempo = 0;
let ultimoFrame = 0;
let ultimaBatida = -1;
let audio = null;

let feedback = "";
let feedbackTempo = 0;
let animJogador = 0;
let animInimigo = 0;

const teclasAtivas = [false, false, false, false];

const LANE_JOGADOR = [600, 685, 770, 855];
const LANE_INIMIGO = [105, 190, 275, 360];
const RECEPTOR_Y = 420;

// SELEÇÃO DE PERSONAGEM


document.querySelectorAll(".personagem").forEach(botao => {
  botao.addEventListener("click", () => {
    if (estado === "jogando") return;

    personagem = botao.dataset.personagem;

    document.querySelectorAll(".personagem")
      .forEach(b => b.classList.remove("selecionado"));

    botao.classList.add("selecionado");

    jogador = PERSONAGENS[personagem];

    inimigo = Object.values(PERSONAGENS).find(
      p => p.nome !== jogador.nome
    );

    document.getElementById("descricaoPersonagem").textContent =
      `Você controla ${jogador.nome}. ${inimigo.nome} será seu adversário!`;
  });
});


// SELEÇÃO DE TECLAS

document.querySelectorAll(".controle").forEach(botao => {
  botao.addEventListener("click", () => {
    if (estado === "jogando") return;

    esquemaControles = botao.dataset.controle;

    document.querySelectorAll(".controle")
      .forEach(b => b.classList.remove("selecionado"));

    botao.classList.add("selecionado");

    const nomes = {
      setas: "SETAS ← ↓ ↑ →",
      wasd: "W A S D",
      dfjk: "D F J K"
    };

    document.getElementById("descricaoControles").textContent =
      "Controles: " + nomes[esquemaControles];
  });
});

// SELEÇÃO DE DIFICULDADE

const DESCRICOES = {
  facil: "Notas lentas, menos setas e penalidade fixa de 6 pontos.",
  normal: "Velocidade intermediária, mais notas e penalidade fixa de 6 pontos.",
  dificil: "Notas muito rápidas, muitas setas e penalidade fixa de 6 pontos!"
};

document.querySelectorAll(".dificuldade").forEach(botao => {
  botao.addEventListener("click", () => {
    if (estado === "jogando") return;

    dificuldade = botao.dataset.dif;
    config = CONFIG[dificuldade];

    document.querySelectorAll(".dificuldade")
      .forEach(b => b.classList.remove("selecionado"));

    botao.classList.add("selecionado");

    document.getElementById("descricaoDificuldade").textContent =
      DESCRICOES[dificuldade];
  });
});

// IDENTIFICAR TECLA

function obterLane(tecla) {
  if (esquemaControles === "setas") {
    return TECLAS[tecla];
  }

  return MAPAS[esquemaControles][tecla];
}

// ÁUDIO

function tom(freq, duracao, tipo = "square", volume = 0.05) {
  if (!audio) return;

  const oscilador = audio.createOscillator();
  const ganho = audio.createGain();

  oscilador.type = tipo;
  oscilador.frequency.value = freq;

  ganho.gain.setValueAtTime(volume, audio.currentTime);
  ganho.gain.exponentialRampToValueAtTime(
    0.001,
    audio.currentTime + duracao
  );

  oscilador.connect(ganho);
  ganho.connect(audio.destination);

  oscilador.start();
  oscilador.stop(audio.currentTime + duracao);
}

function somBatida(n) {
  if (n % 2 === 0) {
    tom(65, 0.15, "sine", 0.12);
  } else {
    tom(180, 0.08, "triangle", 0.035);
  }
}

function somAcerto(lane) {
  const frequencias = [262, 330, 392, 523];
  tom(frequencias[lane], 0.12, "square", 0.06);
}

function somErro() {
  tom(85, 0.2, "sawtooth", 0.07);
}

// GERAR NOTAS

function gerarNotas() {
  const lista = [];
  let seed = 12345;

  function random() {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  }

  const passo = BEAT * config.passo;

  for (let t = 3; t < DURACAO - 2; t += passo) {
    if (random() > config.chance) continue;

    lista.push({
      t,
      lane: Math.floor(random() * 4),
      feita: false
    });
  }

  return lista;
}

// INICIAR JOGO


function iniciar() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
  }

  audio.resume();

  jogador = PERSONAGENS[personagem];

  inimigo = Object.values(PERSONAGENS).find(
    p => p.nome !== jogador.nome
  );

  config = CONFIG[dificuldade];

  notas = gerarNotas();

  pontos = 0;
  combo = 0;
  energia = 65;
  ultimaBatida = -1;

  animJogador = 0;
  animInimigo = 0;

  feedbackTempo = 0;
  feedback = "";

  teclasAtivas.fill(false);

  inicioTempo = performance.now() / 1000 + 1.5;

  estado = "jogando";

  document.getElementById("menu").classList.add("escondido");
  document.getElementById("fim").classList.add("escondido");

  document.getElementById("nomeJogador").textContent = jogador.nome;
  document.getElementById("nomeInimigo").textContent = inimigo.nome;

  document.getElementById("nivel").textContent =
    dificuldade.toUpperCase();

  mostrarFeedback("PREPARE-SE!");

  atualizarPainel();
}


// TEMPO

function tempoAtual() {
  return performance.now() / 1000 - inicioTempo;
}

// FEEDBACK


function mostrarFeedback(texto) {
  feedback = texto;
  feedbackTempo = 0.65;
}


// ACERTAR SETAS

function apertar(lane) {
  if (estado !== "jogando") return;

  teclasAtivas[lane] = true;

  const agora = tempoAtual();

  let alvo = null;
  let menor = config.tolerancia;

  for (const n of notas) {
    if (n.feita || n.lane !== lane) continue;

    const distancia = Math.abs(n.t - agora);

    if (distancia < menor) {
      menor = distancia;
      alvo = n;
    }
  }

  animJogador = 0.25;

  if (alvo) {
    alvo.feita = true;
    combo++;

    const perfeito = menor < config.tolerancia * 0.4;

    pontos += (perfeito ? 150 : 100) + combo * 2;

    energia = Math.min(
      100,
      energia + config.recuperacao
    );

    mostrarFeedback(perfeito ? "SICK!!" : "GOOD!");
    somAcerto(lane);
  } else {
    combo = 0;
    energia -= PENALIDADE_ERRO;

    mostrarFeedback("ERROU!");
    somErro();
  }

  atualizarPainel();
}

// TECLADO

document.addEventListener("keydown", e => {
  if (e.repeat) return;

  const tecla = e.key.length === 1
    ? e.key.toLowerCase()
    : e.key;

  const lane = obterLane(tecla);

  if (lane !== undefined) {
    e.preventDefault();
    apertar(lane);
  }
});

document.addEventListener("keyup", e => {
  const tecla = e.key.length === 1
    ? e.key.toLowerCase()
    : e.key;

  const lane = obterLane(tecla);

  if (lane !== undefined) {
    teclasAtivas[lane] = false;
  }
});

// BOTÕES DE TOQUE


document.querySelectorAll(".teclas-mobile button").forEach(botao => {
  const lane = Number(botao.dataset.lane);

  botao.addEventListener("pointerdown", e => {
    e.preventDefault();
    apertar(lane);
  });

  function soltar() {
    teclasAtivas[lane] = false;
  }

  botao.addEventListener("pointerup", soltar);
  botao.addEventListener("pointerleave", soltar);
  botao.addEventListener("pointercancel", soltar);
});


// ATUALIZAR JOGO

function atualizar(dt) {
  if (estado !== "jogando") return;

  const agora = tempoAtual();

  if (agora < 0) return;

  const batida = Math.floor(agora / BEAT);

  if (batida !== ultimaBatida) {
    ultimaBatida = batida;
    somBatida(batida);

    if (batida % 2 === 0) {
      animInimigo = 0.25;
    }
  }

  for (const n of notas) {
    if (n.feita) continue;

    if (agora > n.t + config.tolerancia) {
      n.feita = true;
      combo = 0;
      energia -= PENALIDADE_ERRO;

      mostrarFeedback("MISS!");
      somErro();
    }
  }

  animJogador = Math.max(0, animJogador - dt);
  animInimigo = Math.max(0, animInimigo - dt);
  feedbackTempo = Math.max(0, feedbackTempo - dt);

  atualizarPainel();

  if (energia <= 0) {
    terminar(false);
    return;
  }

  if (agora >= DURACAO) {
    terminar(true);
  }
}

// PAINEL


function atualizarPainel() {
  document.getElementById("pontos").textContent = pontos;

  document.getElementById("combo").textContent = combo;

  document.getElementById("recorde").textContent = recorde;

  
  const tempoDecorrido = estado === "jogando"
    ? Math.max(0, tempoAtual())
    : 0;

  const restante = Math.max(
    0,
    Math.ceil(DURACAO - tempoDecorrido)
  );


  const minutos = Math.floor(restante / 60);

  const segundos = String(restante % 60).padStart(2, "0");

  document.getElementById("tempo").textContent =
    `${minutos}:${segundos}`;

  document.getElementById("nivel").textContent =
    dificuldade.toUpperCase();

  const barra = document.getElementById("energia");

  barra.style.width = Math.max(0, energia) + "%";

  const cor = energia < 25
    ? "#ff2222"
    : energia < 50
    ? "#ffd400"
    : "#19ef65";

  barra.style.background = cor;
}


// FINALIZAR PARTIDA


function terminar(venceu) {
  estado = "fim";

  if (pontos > recorde) {
    recorde = pontos;

    localStorage.setItem("debateRecorde", recorde);
  }

  document.getElementById("recorde").textContent = recorde;

  document.getElementById("tituloFim").textContent =
    venceu
      ? `🏆 ${jogador.nome} VENCEU O DEBATE!`
      : "💥 GAME OVER!";

  document.getElementById("mensagemFim").textContent =
    venceu
      ? `Você sobreviveu aos 2 minutos e 30 segundos contra ${inimigo.nome}!`
      : `Sua energia acabou antes do fim da batalha contra ${inimigo.nome}!`;

  document.getElementById("pontuacaoFinal").textContent = pontos;

  document.getElementById("recordeFinal").textContent = recorde;

  document.getElementById("fim").classList.remove("escondido");
}


// BOTÕES

document.getElementById("jogar").addEventListener("click", iniciar);
document.getElementById("novamente").addEventListener("click", iniciar);

document.getElementById("voltarMenu").addEventListener("click", () => {
  estado = "inicio";

  document.getElementById("fim").classList.add("escondido");
  document.getElementById("menu").classList.remove("escondido");
});

// CENÁRIO

function desenharCenario(agora) {
  const gradiente = ctx.createLinearGradient(0, 0, 0, 540);

  gradiente.addColorStop(0, "#101d50");
  gradiente.addColorStop(1, "#080817");

  ctx.fillStyle = gradiente;
  ctx.fillRect(0, 0, 960, 540);

  for (let i = 0; i < 8; i++) {
    ctx.fillStyle =
      `rgba(100,160,255,${0.15 + Math.sin(agora * 3 + i) * 0.08})`;

    ctx.beginPath();
    ctx.arc(60 + i * 120, 30, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#07102c";
  ctx.fillRect(190, 75, 580, 145);

  ctx.strokeStyle = "#3c80ff";
  ctx.lineWidth = 4;
  ctx.strokeRect(190, 75, 580, 145);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd400";
  ctx.font = "bold 48px Arial";
  ctx.fillText("DEBATE", 480, 140);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px Arial";
  ctx.fillText("ELEIÇÕES • AO VIVO", 480, 180);

  ctx.fillStyle = "#ff3030";
  ctx.fillRect(190, 224, 580, 5);

  for (let i = 0; i < 22; i++) {
    const x = 15 + i * 44;
    const y = 285 + Math.sin(i * 3) * 8;

    ctx.fillStyle = "#18234c";
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e2b18e";
    ctx.beginPath();
    ctx.arc(x, y - 20, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#101a42";
  ctx.fillRect(0, 410, 960, 130);

  ctx.fillStyle = "#3458aa";
  ctx.fillRect(0, 410, 960, 5);

  desenharPulpito(245, inimigo.cor);
  desenharPulpito(715, jogador.cor);

  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";

  ctx.fillStyle = inimigo.corClara;
  ctx.fillText(inimigo.nome, 245, 490);

  ctx.fillStyle = jogador.corClara;
  ctx.fillText(jogador.nome, 715, 490);
}

function desenharPulpito(x, cor) {
  ctx.fillStyle = cor;
  ctx.fillRect(x - 55, 370, 110, 100);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 55, 370, 110, 6);

  ctx.fillStyle = "#333";
  ctx.fillRect(x - 5, 330, 10, 40);

  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x, 327, 10, 0, Math.PI * 2);
  ctx.fill();
}

// DESENHAR PERSONAGENS

function desenharPersonagem(x, y, tipo, anim) {
  ctx.save();

  const pulo = anim > 0
    ? -12
    : Math.sin(performance.now() / 180) * 3;

  ctx.translate(x, y + pulo);

  ctx.fillStyle = tipo.roupa;
  ctx.fillRect(-30, 0, 60, 70);

  if (tipo.nome === "FLÁVIO") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(-10, 0, 20, 45);

    ctx.fillStyle = "#2255cc";
    ctx.fillRect(-4, 0, 8, 40);
  }

  ctx.fillStyle = "#e9b58f";
  ctx.beginPath();
  ctx.arc(0, -25, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = tipo.cabelo;
  ctx.beginPath();
  ctx.arc(0, -43, 27, Math.PI, Math.PI * 2);
  ctx.fill();

  if (tipo.nome === "LULA") {
    ctx.beginPath();
    ctx.arc(0, -9, 23, 0, Math.PI);
    ctx.fill();
  }

  ctx.fillStyle = "#222";
  ctx.fillRect(-12, -28, 5, 5);
  ctx.fillRect(8, -28, 5, 5);

  const lado = x < 480 ? 1 : -1;

  ctx.strokeStyle = "#e9b58f";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(lado * 25, 15);
  ctx.lineTo(lado * 38, -15);
  ctx.stroke();

  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(lado * 40, -20, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// DESENHAR SETAS

function desenharSeta(x, y, lane, alpha = 1, ativa = false) {
  ctx.save();

  ctx.globalAlpha = alpha;

  ctx.fillStyle = ativa ? CORES[lane] : "#111a3b";
  ctx.strokeStyle = CORES[lane];
  ctx.lineWidth = 4;

  ctx.beginPath();
  ctx.roundRect(x - 29, y - 29, 58, 58, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 34px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillText(SETAS[lane], x, y + 2);

  ctx.restore();
}

// DESENHAR JOGO

function desenhar() {
  const agora = estado === "jogando"
    ? Math.max(0, tempoAtual())
    : 0;

  desenharCenario(agora);

  desenharPersonagem(245, 300, inimigo, animInimigo);
  desenharPersonagem(715, 300, jogador, animJogador);

  for (let i = 0; i < 4; i++) {
    desenharSeta(LANE_INIMIGO[i], RECEPTOR_Y, i, 0.3, false);
  }

  for (let i = 0; i < 4; i++) {
    desenharSeta(
      LANE_JOGADOR[i],
      RECEPTOR_Y,
      i,
      1,
      teclasAtivas[i]
    );
  }

  if (estado === "jogando") {
    for (const n of notas) {
      if (n.feita) continue;

      const y = RECEPTOR_Y -
        (n.t - agora) * config.velocidade;

      if (y < -40 || y > 550) continue;

      desenharSeta(LANE_JOGADOR[n.lane], y, n.lane);
    }
  }

  if (feedbackTempo > 0) {
    ctx.save();

    ctx.textAlign = "center";
    ctx.font = "bold 40px Arial";

    ctx.fillStyle =
      feedback === "SICK!!"
        ? "#ffd400"
        : feedback === "GOOD!"
        ? "#19ef65"
        : feedback === "PREPARE-SE!"
        ? "#ffffff"
        : "#ff3333";

    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 20;

    ctx.fillText(
      feedback,
      480,
      260 - (0.65 - feedbackTempo) * 20
    );

    ctx.restore();
  }

  if (estado === "jogando") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(
      0,
      535,
      960 * Math.min(1, agora / DURACAO),
      5
    );
  }
}

// LOOP PRINCIPAL

function loop(timestamp) {
  const dt = Math.min((timestamp - ultimoFrame) / 1000, 0.05);

  ultimoFrame = timestamp;

  atualizar(dt);
  desenhar();

  requestAnimationFrame(loop);
}

// ESTADO INICIAL


jogador = PERSONAGENS.lula;
inimigo = PERSONAGENS.flavio;

document.getElementById("nivel").textContent = "FÁCIL";

document.getElementById("nomeJogador").textContent = jogador.nome;
document.getElementById("nomeInimigo").textContent = inimigo.nome;

document.getElementById("recorde").textContent = recorde;

atualizarPainel();

desenhar();

requestAnimationFrame(loop);

