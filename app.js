
(function () {

  'use strict';

  /* ================= utilidades ================= */
  // $ pega UM elemento da página; $$ pega VÁRIOS. Ex.: $('#c-peso') = campo de peso.
  // $(seletor) devolve o PRIMEIRO elemento que bate com o seletor CSS; 'el' permite procurar dentro de outro elemento (padrão: a página toda).
  const $ = (s, el = document) => el.querySelector(s);
  // $$(seletor) devolve TODOS os elementos que batem, já convertidos em array (para poder usar .map, .forEach...).
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  // esc: protege textos digitados pela pessoa antes de colocar na página (evita código malicioso).
  // Troca cada caractere perigoso (& < > " ') pelo código HTML equivalente; 's ?? ""' evita erro se vier null/undefined.
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // norm: deixa o texto minúsculo e sem acento ("Feijão" vira "feijao") para comparar palavras.
  // Converte para texto, deixa minúsculo, separa letra e acento (NFD), apaga os acentos com a regex e tira espaços das pontas.
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  // num: troca vírgula por ponto, converte para número e devolve NaN ("não é número") se a conversão falhar.
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  // fmt1: formata um número no padrão brasileiro com exatamente 1 casa decimal (ex.: 23.456 -> "23,5").
  const fmt1 = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // toMin/hhmm: convertem horário "07:30" em minutos do dia (450) e de volta.
  // toMin: separa "HH:MM" em horas e minutos e devolve h*60 + m; se vier vazio devolve NaN.
  const toMin = (t) => { if (!t) return NaN; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  // hhmm: faz o caminho contrário. O '% 1440' (minutos num dia) faz 25:00 virar 01:00; padStart coloca o zero na frente ("7" -> "07").
  const hhmm = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  // round5: arredonda para o múltiplo de 5 mais próximo, nunca menos que 5 (usado nas gramas da dieta).
  const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);
  // clamp: "prende" o número n entre o mínimo a e o máximo b.
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  // store: guarda e lê dados no navegador. Se o navegador bloquear (janela anônima),
  // os dados ficam só na memória até a página fechar.
  // Objeto de reserva: guarda os dados na memória caso o localStorage não funcione.
  const mem = {};
  // Objeto com três funções para lidar com o armazenamento do navegador.
  const store = {
    // get(chave, padrão): lê a chave do localStorage e converte o texto JSON em objeto; se não existir devolve o padrão; se der erro, usa a memória.
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return k in mem ? mem[k] : d; } },
    // set(chave, valor): guarda na memória e tenta gravar no localStorage como texto JSON (se falhar, fica só na memória).
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado: fica em memória */ } },
    // del(chave): apaga a chave da memória e do localStorage (erros são ignorados).
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) {} }
  // Fim do objeto store.
  };

  // hash: embaralha a senha antes de guardar, para ela nunca ficar salva como texto.
  // Função assíncrona (async) porque a criptografia do navegador demora um instante e devolve uma Promise.
  async function hash(txt) {
    // Tenta usar a criptografia oficial do navegador.
    try {
      // Calcula o SHA-256 do texto "prumo:" + senha; 'await' espera o resultado (um buffer de bytes).
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('prumo:' + txt));
      // Transforma cada byte em 2 dígitos hexadecimais e junta tudo num texto (é esse texto que é salvo, não a senha).
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    // Se o navegador não tiver crypto.subtle (ex.: página aberta como arquivo em alguns navegadores)...
    } catch (e) {
      // ...usa um hash simples (djb2): percorre cada letra misturando os bits; '>>> 0' deixa o número positivo antes de virar hexadecimal.
      let h = 5381; for (const c of 'prumo:' + txt) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return 'x' + (h >>> 0).toString(16);
    // Fim do bloco try/catch.
    }
  // Fim da função hash.
  }

  // toast: a mensagenzinha preta que aparece embaixo da tela ("Conta criada", "Mensagem copiada").
  // Guarda o "cronômetro" do toast atual, para poder cancelá-lo se outro toast aparecer.
  let toastT;
  // Função que mostra uma mensagem rápida na tela.
  function toast(msg) {
    // Procura o elemento .toast; se ainda não existe, cria uma <div class="toast" role="status"> e coloca no fim do <body>.
    let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    // Escreve a mensagem, mostra o toast, cancela o timer anterior e agenda esconder de novo depois de 2,6 segundos.
    t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
  // Fim da função toast.
  }

  /* ================= dados ================= */
  // Esportes que aparecem como botões na etapa 2.
  // Para incluir um: { id: 'apelido-sem-espaco', nome: 'Nome que aparece', ico: 'emoji' }
  // Lista (array) de esportes; cada item é um objeto com id, nome e ícone.
  const SPORTS = [
    // Esporte "Musculação / academia" (id interno 'musculacao'; o emoji é o ícone do botão).
    { id: 'musculacao', nome: 'Musculação / academia', ico: '🏋️' },
    // Esporte "Futebol" (id interno 'futebol'; o emoji é o ícone do botão).
    { id: 'futebol', nome: 'Futebol', ico: '⚽' },
    // Esporte "Jiu-jitsu" (id interno 'jiujitsu'; o emoji é o ícone do botão).
    { id: 'jiujitsu', nome: 'Jiu-jitsu', ico: '🥋' },
    // Esporte "Basquete" (id interno 'basquete'; o emoji é o ícone do botão).
    { id: 'basquete', nome: 'Basquete', ico: '🏀' },
    // Esporte "Corrida" (id interno 'corrida'; o emoji é o ícone do botão).
    { id: 'corrida', nome: 'Corrida', ico: '🏃' },
    // Esporte "Natação" (id interno 'natacao'; o emoji é o ícone do botão).
    { id: 'natacao', nome: 'Natação', ico: '🏊' },
    // Esporte "Vôlei" (id interno 'volei'; o emoji é o ícone do botão).
    { id: 'volei', nome: 'Vôlei', ico: '🏐' },
    // Esporte "Ciclismo" (id interno 'ciclismo'; o emoji é o ícone do botão).
    { id: 'ciclismo', nome: 'Ciclismo', ico: '🚴' },
    // Esporte "Muay thai / boxe" (id interno 'muaythai'; o emoji é o ícone do botão).
    { id: 'muaythai', nome: 'Muay thai / boxe', ico: '🥊' },
    // Esporte "Funcional / crossfit" (id interno 'funcional'; o emoji é o ícone do botão).
    { id: 'funcional', nome: 'Funcional / crossfit', ico: '🤸' },
    // Esporte "Dança" (id interno 'danca'; o emoji é o ícone do botão).
    { id: 'danca', nome: 'Dança', ico: '💃' },
    // Esporte "Tênis / beach tennis" (id interno 'tenis'; o emoji é o ícone do botão).
    { id: 'tenis', nome: 'Tênis / beach tennis', ico: '🎾' },
    // Esporte "Pilates / yoga" (id interno 'pilates'; o emoji é o ícone do botão).
    { id: 'pilates', nome: 'Pilates / yoga', ico: '🧘' }
  // Fim da lista SPORTS.
  ];
  // Cria um "dicionário" id -> esporte (ex.: SPORT_BY.futebol) para achar um esporte rápido pelo id.
  const SPORT_BY = Object.fromEntries(SPORTS.map((s) => [s.id, s]));
  // Palavras usadas na busca do Google Maps para cada esporte (etapa "Novo esporte").
  // O primeiro termo de cada lista vira o botão principal (verde).
  // Objeto: para cada id de esporte, uma lista de termos de busca.
  const SEARCH_TERMS = {
    // Buscas para 'musculacao': 'academia', 'academia 24 horas', 'personal trainer'.
    musculacao: ['academia', 'academia 24 horas', 'personal trainer'],
    // Buscas para 'futebol': 'escolinha de futebol', 'quadra society aluguel', 'futebol society'.
    futebol: ['escolinha de futebol', 'quadra society aluguel', 'futebol society'],
    // Buscas para 'jiujitsu': 'academia de jiu-jitsu', 'jiu-jitsu aula experimental', 'artes marciais'.
    jiujitsu: ['academia de jiu-jitsu', 'jiu-jitsu aula experimental', 'artes marciais'],
    // Buscas para 'basquete': 'escolinha de basquete', 'quadra de basquete', 'clube basquete'.
    basquete: ['escolinha de basquete', 'quadra de basquete', 'clube basquete'],
    // Buscas para 'corrida': 'assessoria de corrida', 'grupo de corrida', 'pista de atletismo'.
    corrida: ['assessoria de corrida', 'grupo de corrida', 'pista de atletismo'],
    // Buscas para 'natacao': 'escola de natação', 'academia com piscina', 'natação adulto'.
    natacao: ['escola de natação', 'academia com piscina', 'natação adulto'],
    // Buscas para 'volei': 'escolinha de vôlei', 'vôlei de praia aula', 'clube de vôlei'.
    volei: ['escolinha de vôlei', 'vôlei de praia aula', 'clube de vôlei'],
    // Buscas para 'ciclismo': 'grupo de pedal', 'aula de spinning', 'loja de bicicleta'.
    ciclismo: ['grupo de pedal', 'aula de spinning', 'loja de bicicleta'],
    // Buscas para 'muaythai': 'academia de muay thai', 'academia de boxe', 'artes marciais'.
    muaythai: ['academia de muay thai', 'academia de boxe', 'artes marciais'],
    // Buscas para 'funcional': 'treino funcional', 'box de crossfit', 'cross training'.
    funcional: ['treino funcional', 'box de crossfit', 'cross training'],
    // Buscas para 'danca': 'escola de dança', 'aula de dança adulto', 'zumba'.
    danca: ['escola de dança', 'aula de dança adulto', 'zumba'],
    // Buscas para 'tenis': 'aula de tênis', 'beach tennis aula', 'quadra de tênis'.
    tenis: ['aula de tênis', 'beach tennis aula', 'quadra de tênis'],
    // Buscas para 'pilates': 'estúdio de pilates', 'aula de yoga', 'pilates aula experimental'.
    pilates: ['estúdio de pilates', 'aula de yoga', 'pilates aula experimental']
  // Fim do objeto SEARCH_TERMS.
  };

  // Regiões do corpo da etapa opcional.
  // Lista das regiões do corpo (id interno + nome que aparece na tela).
  const FOCOS = [
    // Regiões: barriga, laterais e braços.
    { id: 'barriga', nome: 'Barriga' }, { id: 'flancos', nome: 'Laterais (pneuzinho)' }, { id: 'bracos', nome: 'Braços' },
    // Regiões: coxas, glúteos e costas.
    { id: 'coxas', nome: 'Coxas' }, { id: 'gluteos', nome: 'Glúteos e quadril' }, { id: 'costas', nome: 'Costas' },
    // Regiões: peito e rosto.
    { id: 'peito', nome: 'Peito' }, { id: 'rosto', nome: 'Rosto e papada' }
  // Fim da lista FOCOS.
  ];
  // Exercícios extras que entram no treino quando a pessoa escolhe uma região.
  // Formato: ['Nome do exercício', 'séries × repetições']
  // Objeto: para cada região, uma lista de exercícios extras.
  const FOCO_EX = {
    // Extras para 'barriga': Abdominal infra no solo (3 × 15); Prancha (3 × 40 s)
    barriga: [['Abdominal infra no solo', '3 × 15'], ['Prancha', '3 × 40 s']],
    // Extras para 'flancos': Prancha lateral (3 × 30 s cada lado); Pallof press no cabo (3 × 12 cada lado)
    flancos: [['Prancha lateral', '3 × 30 s cada lado'], ['Pallof press no cabo', '3 × 12 cada lado']],
    // Extras para 'bracos': Rosca martelo (3 × 12); Tríceps francês com halter (3 × 12)
    bracos: [['Rosca martelo', '3 × 12'], ['Tríceps francês com halter', '3 × 12']],
    // Extras para 'coxas': Afundo alternado (3 × 10 cada perna); Cadeira adutora (3 × 15)
    coxas: [['Afundo alternado', '3 × 10 cada perna'], ['Cadeira adutora', '3 × 15']],
    // Extras para 'gluteos': Elevação pélvica (4 × 12); Abdução na máquina (3 × 15)
    gluteos: [['Elevação pélvica', '4 × 12'], ['Abdução na máquina', '3 × 15']],
    // Extras para 'costas': Remada unilateral (3 × 12 cada lado); Pulldown braço estendido (3 × 12)
    costas: [['Remada unilateral', '3 × 12 cada lado'], ['Pulldown braço estendido', '3 × 12']],
    // Extras para 'peito': Crucifixo com halteres (3 × 12); Flexão de braço (3 × máx.)
    peito: [['Crucifixo com halteres', '3 × 12'], ['Flexão de braço', '3 × máx.']],
    // Extras para 'rosto': nenhum (gordura do rosto não sai com exercício localizado).
    rosto: []
  // Fim do objeto FOCO_EX.
  };

  // Treinos de academia prontos. O site escolhe quais usar pelo número de dias:
  //   2 dias -> fullA e fullB (corpo todo)
  //   3 dias -> A, B e C
  //   4 dias -> up1, lo1, up2, lo2 (superiores e inferiores)
  // grupo: 'sup' = parte de cima, 'inf' = pernas, 'full' = corpo todo.
  // Objeto com todos os treinos prontos; cada um tem nome, foco, grupo e a lista de exercícios (ex).
  const EX = {
    // Treino 'fullA': Treino A — Corpo todo (grupo full), 5 exercícios.
    fullA: { nome: 'Treino A', foco: 'Corpo todo', grupo: 'full', ex: [['Agachamento goblet', '3 × 12'], ['Supino com halteres', '3 × 10'], ['Remada baixa', '3 × 12'], ['Desenvolvimento com halteres', '3 × 10'], ['Prancha', '3 × 30 s']] },
    // Treino 'fullB': Treino B — Corpo todo (grupo full), 6 exercícios.
    fullB: { nome: 'Treino B', foco: 'Corpo todo', grupo: 'full', ex: [['Leg press', '3 × 12'], ['Puxada frente', '3 × 10'], ['Stiff com halteres', '3 × 12'], ['Flexão de braço', '3 × máx.'], ['Elevação lateral', '3 × 12'], ['Abdominal bicicleta', '3 × 15']] },
    // Treino 'A': Treino A — Peito, ombro e tríceps (grupo sup), 5 exercícios.
    A: { nome: 'Treino A', foco: 'Peito, ombro e tríceps', grupo: 'sup', ex: [['Supino reto', '3 × 10'], ['Supino inclinado com halteres', '3 × 12'], ['Desenvolvimento com halteres', '3 × 10'], ['Elevação lateral', '3 × 12'], ['Tríceps na polia', '3 × 12']] },
    // Treino 'B': Treino B — Pernas e glúteos (grupo inf), 5 exercícios.
    B: { nome: 'Treino B', foco: 'Pernas e glúteos', grupo: 'inf', ex: [['Agachamento livre', '4 × 10'], ['Leg press', '3 × 12'], ['Cadeira extensora', '3 × 12'], ['Mesa flexora', '3 × 12'], ['Panturrilha em pé', '3 × 15']] },
    // Treino 'C': Treino C — Costas, bíceps e abdômen (grupo sup), 5 exercícios.
    C: { nome: 'Treino C', foco: 'Costas, bíceps e abdômen', grupo: 'sup', ex: [['Puxada frente', '3 × 10'], ['Remada curvada', '3 × 10'], ['Face pull', '3 × 15'], ['Rosca direta', '3 × 12'], ['Abdominal infra', '3 × 15']] },
    // Treino 'up1': Treino A — Superiores (grupo sup), 6 exercícios.
    up1: { nome: 'Treino A', foco: 'Superiores', grupo: 'sup', ex: [['Supino reto', '4 × 8'], ['Remada baixa', '4 × 10'], ['Desenvolvimento com halteres', '3 × 10'], ['Puxada frente', '3 × 10'], ['Tríceps na polia', '3 × 12'], ['Rosca direta', '3 × 12']] },
    // Treino 'lo1': Treino B — Inferiores (grupo inf), 5 exercícios.
    lo1: { nome: 'Treino B', foco: 'Inferiores', grupo: 'inf', ex: [['Agachamento livre', '4 × 8'], ['Stiff', '3 × 10'], ['Leg press', '3 × 12'], ['Mesa flexora', '3 × 12'], ['Panturrilha', '3 × 15']] },
    // Treino 'up2': Treino C — Superiores (grupo sup), 6 exercícios.
    up2: { nome: 'Treino C', foco: 'Superiores', grupo: 'sup', ex: [['Supino inclinado com halteres', '3 × 10'], ['Remada unilateral', '3 × 10'], ['Elevação lateral', '3 × 15'], ['Pulldown pegada fechada', '3 × 12'], ['Tríceps francês', '3 × 12'], ['Rosca martelo', '3 × 12']] },
    // Treino 'lo2': Treino D — Inferiores e core (grupo inf), 5 exercícios.
    lo2: { nome: 'Treino D', foco: 'Inferiores e core', grupo: 'inf', ex: [['Agachamento búlgaro', '3 × 10 cada'], ['Elevação pélvica', '4 × 12'], ['Cadeira extensora', '3 × 15'], ['Cadeira abdutora', '3 × 15'], ['Prancha', '3 × 40 s']] }
  // Fim do objeto EX.
  };
  // Diz em que tipo de treino cada região se encaixa: 'any' = qualquer treino, 'sup' = superiores, 'inf' = inferiores.
  const FOCO_GRUPO = { barriga: 'any', flancos: 'any', bracos: 'sup', peito: 'sup', costas: 'sup', coxas: 'inf', gluteos: 'inf' };
  // Nomes curtos dos dias da semana, começando na segunda (índice 0 = Seg ... 6 = Dom).
  const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  /* ---------- ALIMENTOS DA DIETA ----------
     Cada alimento é escrito assim:
       F('Nome', quantidade, unidade, calorias, 'palavras de busca', [restrições], escala, 'singular|plural')
     - quantidade/unidade: a porção base (ex.: 120 'g'). Use 'un' para itens contados (ovos, pães).
     - calorias: kcal DAQUELA porção.
     - palavras de busca: se a pessoa escrever uma delas em "não gosto", o alimento sai.
     - restrições: 'carne', 'peixe', 'ovo', 'lactose', 'gluten'.
     - escala: true = a quantidade aumenta/diminui conforme a meta de calorias (padrão);
               false = quantidade fixa (frutas, verduras, azeite).
     Os grupos (cafeCarb, fruta, prot...) dizem em qual parte da refeição o alimento pode entrar. */
  /* Alimentos: k = kcal da porção base; s = escala com a meta; f = flags; w = palavras para "não gosto" */
  // F é uma "fábrica": recebe os dados do alimento e devolve um objeto curto. 'w.split(" ")' transforma as palavras de busca numa lista.
  const F = (n, q, u, k, w, f = [], s = true, un) => ({ n, q, u, k, w: w.split(' '), f, s, un });
  // POOLS = "bancos" de alimentos, separados por grupo.
  const POOLS = {
    // Grupo cafeCarb: carboidratos do café da manhã.
    cafeCarb: [
      // Alimento — Pão francês: 1 un = 135 kcal, contém gluten.
      F('Pão francês', 1, 'un', 135, 'pao frances trigo', ['gluten'], true, 'unidade|unidades'),
      // Alimento — Pão integral: 2 un = 130 kcal, contém gluten.
      F('Pão integral', 2, 'un', 130, 'pao integral trigo', ['gluten'], true, 'fatia|fatias'),
      // Alimento — Tapioca (goma): 50 g = 170 kcal.
      F('Tapioca (goma)', 50, 'g', 170, 'tapioca goma'),
      // Alimento — Cuscuz de milho: 120 g = 135 kcal.
      F('Cuscuz de milho', 120, 'g', 135, 'cuscuz milho flocao'),
      // Alimento — Aveia em flocos: 35 g = 135 kcal, contém gluten.
      F('Aveia em flocos', 35, 'g', 135, 'aveia', ['gluten']),
      // Alimento — Batata-doce cozida: 120 g = 105 kcal.
      F('Batata-doce cozida', 120, 'g', 105, 'batata doce batata-doce')
    // Fim do grupo cafeCarb.
    ],
    // Grupo cafeProt: proteínas do café da manhã.
    cafeProt: [
      // Alimento — Ovos mexidos: 2 un = 150 kcal, contém ovo.
      F('Ovos mexidos', 2, 'un', 150, 'ovo ovos', ['ovo'], true, 'ovo|ovos'),
      // Alimento — Queijo minas frescal: 40 g = 105 kcal, contém lactose.
      F('Queijo minas frescal', 40, 'g', 105, 'queijo minas laticinio laticinios', ['lactose']),
      // Alimento — Iogurte natural: 170 g = 105 kcal, contém lactose.
      F('Iogurte natural', 170, 'g', 105, 'iogurte laticinio laticinios leite', ['lactose']),
      // Alimento — Peito de peru: 40 g = 45 kcal, contém carne.
      F('Peito de peru', 40, 'g', 45, 'peru embutido frios', ['carne']),
      // Alimento — Tofu mexido: 100 g = 95 kcal.
      F('Tofu mexido', 100, 'g', 95, 'tofu soja'),
      // Alimento — Pasta de amendoim: 15 g = 90 kcal.
      F('Pasta de amendoim', 15, 'g', 90, 'amendoim pasta')
    // Fim do grupo cafeProt.
    ],
    // Grupo fruta: frutas (quantidade fixa, não escalam).
    fruta: [
      // Alimentos — Banana: 1 un = 90 kcal, quantidade fixa | Mamão papaia: 150 g = 60 kcal, quantidade fixa.
      F('Banana', 1, 'un', 90, 'banana', [], false, 'unidade|unidades'), F('Mamão papaia', 150, 'g', 60, 'mamao papaia', [], false),
      // Alimentos — Maçã: 1 un = 70 kcal, quantidade fixa | Morangos: 150 g = 50 kcal, quantidade fixa.
      F('Maçã', 1, 'un', 70, 'maca', [], false, 'unidade|unidades'), F('Morangos', 150, 'g', 50, 'morango morangos', [], false),
      // Alimentos — Melão: 180 g = 55 kcal, quantidade fixa | Abacaxi: 150 g = 75 kcal, quantidade fixa.
      F('Melão', 180, 'g', 55, 'melao', [], false), F('Abacaxi', 150, 'g', 75, 'abacaxi', [], false),
      // Alimentos — Laranja: 1 un = 65 kcal, quantidade fixa | Manga: 120 g = 75 kcal, quantidade fixa.
      F('Laranja', 1, 'un', 65, 'laranja', [], false, 'unidade|unidades'), F('Manga', 120, 'g', 75, 'manga', [], false),
      // Alimento — Uvas: 100 g = 70 kcal, quantidade fixa.
      F('Uvas', 100, 'g', 70, 'uva uvas', [], false)
    // Fim do grupo fruta.
    ],
    // Grupo lancheProt: proteínas para os lanches.
    lancheProt: [
      // Alimento — Iogurte natural: 170 g = 105 kcal, contém lactose.
      F('Iogurte natural', 170, 'g', 105, 'iogurte laticinio laticinios leite', ['lactose']),
      // Alimento — Castanhas mistas: 20 g = 125 kcal.
      F('Castanhas mistas', 20, 'g', 125, 'castanha castanhas nozes oleaginosas'),
      // Alimento — Ovos cozidos: 2 un = 145 kcal, contém ovo.
      F('Ovos cozidos', 2, 'un', 145, 'ovo ovos', ['ovo'], true, 'ovo|ovos'),
      // Alimento — Queijo coalho: 40 g = 120 kcal, contém lactose.
      F('Queijo coalho', 40, 'g', 120, 'queijo coalho laticinio laticinios', ['lactose']),
      // Alimento — Pasta de amendoim: 15 g = 90 kcal.
      F('Pasta de amendoim', 15, 'g', 90, 'amendoim pasta'),
      // Alimento — Homus: 50 g = 85 kcal.
      F('Homus', 50, 'g', 85, 'homus grao de bico grao-de-bico')
    // Fim do grupo lancheProt.
    ],
    // Grupo lancheCarb: carboidratos para os lanches.
    lancheCarb: [
      // Alimento — Pão integral: 1 un = 65 kcal, contém gluten.
      F('Pão integral', 1, 'un', 65, 'pao integral trigo', ['gluten'], true, 'fatia|fatias'),
      // Alimento — Aveia em flocos: 20 g = 75 kcal, contém gluten.
      F('Aveia em flocos', 20, 'g', 75, 'aveia', ['gluten']),
      // Alimento — Tapioca (goma): 25 g = 85 kcal.
      F('Tapioca (goma)', 25, 'g', 85, 'tapioca goma'),
      // Alimento — Bolacha de arroz: 2 un = 55 kcal.
      F('Bolacha de arroz', 2, 'un', 55, 'bolacha arroz biscoito', [], true, 'unidade|unidades'),
      // Alimento — Granola sem açúcar: 20 g = 85 kcal, contém gluten.
      F('Granola sem açúcar', 20, 'g', 85, 'granola', ['gluten'])
    // Fim do grupo lancheCarb.
    ],
    // Grupo base: carboidrato principal do almoço e do jantar.
    base: [
      // Alimentos — Arroz branco: 120 g = 155 kcal | Arroz integral: 120 g = 150 kcal.
      F('Arroz branco', 120, 'g', 155, 'arroz branco'), F('Arroz integral', 120, 'g', 150, 'arroz integral'),
      // Alimentos — Batata-doce cozida: 150 g = 130 kcal | Mandioca cozida: 120 g = 150 kcal.
      F('Batata-doce cozida', 150, 'g', 130, 'batata doce batata-doce'), F('Mandioca cozida', 120, 'g', 150, 'mandioca aipim macaxeira'),
      // Alimentos — Macarrão integral: 110 g = 150 kcal, contém gluten | Batata inglesa cozida: 180 g = 140 kcal.
      F('Macarrão integral', 110, 'g', 150, 'macarrao massa trigo', ['gluten']), F('Batata inglesa cozida', 180, 'g', 140, 'batata inglesa'),
      // Alimentos — Quinoa cozida: 120 g = 145 kcal | Cuscuz de milho: 130 g = 145 kcal.
      F('Quinoa cozida', 120, 'g', 145, 'quinoa'), F('Cuscuz de milho', 130, 'g', 145, 'cuscuz milho flocao')
    // Fim do grupo base.
    ],
    // Grupo feijao: leguminosas (quantidade fixa).
    feijao: [
      // Alimentos — Feijão carioca: 100 g = 75 kcal, quantidade fixa | Feijão preto: 100 g = 75 kcal, quantidade fixa.
      F('Feijão carioca', 100, 'g', 75, 'feijao carioca', [], false), F('Feijão preto', 100, 'g', 75, 'feijao preto', [], false),
      // Alimentos — Lentilha: 100 g = 95 kcal, quantidade fixa | Grão-de-bico: 80 g = 130 kcal, quantidade fixa.
      F('Lentilha', 100, 'g', 95, 'lentilha', [], false), F('Grão-de-bico', 80, 'g', 130, 'grao de bico grao-de-bico', [], false),
      // Alimento — Ervilha: 80 g = 65 kcal, quantidade fixa.
      F('Ervilha', 80, 'g', 65, 'ervilha', [], false)
    // Fim do grupo feijao.
    ],
    // Grupo prot: proteína principal do almoço e do jantar.
    prot: [
      // Alimento — Frango grelhado: 120 g = 190 kcal, contém carne.
      F('Frango grelhado', 120, 'g', 190, 'frango galinha peito ave', ['carne']),
      // Alimento — Patinho moído: 110 g = 200 kcal, contém carne.
      F('Patinho moído', 110, 'g', 200, 'carne vermelha boi bovina patinho moida', ['carne']),
      // Alimento — Tilápia grelhada: 140 g = 140 kcal, contém peixe.
      F('Tilápia grelhada', 140, 'g', 140, 'peixe tilapia frutos do mar', ['peixe']),
      // Alimento — Omelete: 2 un = 160 kcal, contém ovo.
      F('Omelete', 2, 'un', 160, 'ovo ovos omelete', ['ovo'], true, 'ovo|ovos'),
      // Alimento — Lombo suíno assado: 110 g = 190 kcal, contém carne.
      F('Lombo suíno assado', 110, 'g', 190, 'porco suino lombo carne vermelha', ['carne']),
      // Alimento — Sardinha assada: 100 g = 165 kcal, contém peixe.
      F('Sardinha assada', 100, 'g', 165, 'peixe sardinha frutos do mar', ['peixe']),
      // Alimento — Tofu grelhado: 150 g = 145 kcal.
      F('Tofu grelhado', 150, 'g', 145, 'tofu soja'),
      // Alimento — Coxa de frango sem pele: 120 g = 200 kcal, contém carne.
      F('Coxa de frango sem pele', 120, 'g', 200, 'frango galinha coxa ave', ['carne']),
      // Alimento — Carne de panela (músculo): 110 g = 210 kcal, contém carne.
      F('Carne de panela (músculo)', 110, 'g', 210, 'carne vermelha boi bovina musculo', ['carne']),
      // Alimento — Salmão grelhado: 110 g = 230 kcal, contém peixe.
      F('Salmão grelhado', 110, 'g', 230, 'peixe salmao frutos do mar', ['peixe'])
    // Fim do grupo prot.
    ],
    // Grupo veg: verduras e legumes (quantidade fixa).
    veg: [
      // Alimento — Salada de alface e tomate: 100 g = 20 kcal, quantidade fixa.
      F('Salada de alface e tomate', 100, 'g', 20, 'alface tomate salada folhas verdura', [], false),
      // Alimento — Brócolis no vapor: 100 g = 35 kcal, quantidade fixa.
      F('Brócolis no vapor', 100, 'g', 35, 'brocolis verdura legume', [], false),
      // Alimento — Abobrinha refogada: 100 g = 30 kcal, quantidade fixa.
      F('Abobrinha refogada', 100, 'g', 30, 'abobrinha legume', [], false),
      // Alimento — Cenoura ralada: 60 g = 25 kcal, quantidade fixa.
      F('Cenoura ralada', 60, 'g', 25, 'cenoura legume', [], false),
      // Alimento — Couve refogada: 60 g = 35 kcal, quantidade fixa.
      F('Couve refogada', 60, 'g', 35, 'couve verdura', [], false),
      // Alimento — Beterraba cozida: 70 g = 30 kcal, quantidade fixa.
      F('Beterraba cozida', 70, 'g', 30, 'beterraba legume', [], false),
      // Alimento — Chuchu refogado: 100 g = 25 kcal, quantidade fixa.
      F('Chuchu refogado', 100, 'g', 25, 'chuchu legume', [], false),
      // Alimento — Pepino com cebola roxa: 100 g = 18 kcal, quantidade fixa.
      F('Pepino com cebola roxa', 100, 'g', 18, 'pepino cebola salada', [], false),
      // Alimento — Vagem cozida: 80 g = 25 kcal, quantidade fixa.
      F('Vagem cozida', 80, 'g', 25, 'vagem legume', [], false),
      // Alimento — Repolho refogado: 80 g = 22 kcal, quantidade fixa.
      F('Repolho refogado', 80, 'g', 22, 'repolho', [], false)
    // Fim do grupo veg.
    ],
    // Grupo gordura: só o azeite, 5 ml fixos.
    gordura: [F('Azeite de oliva', 5, 'ml', 45, 'azeite oleo', [], false)]
  // Fim do objeto POOLS.
  };
  // Refeições e de quais grupos de alimentos cada uma é montada.
  // Objeto com as refeições: nome que aparece e 'comp' = lista dos grupos usados para montá-la.
  const MEALS = {
    // Café da manhã = 1 carboidrato + 1 proteína + 1 fruta.
    cafe: { nome: 'Café da manhã', comp: ['cafeCarb', 'cafeProt', 'fruta'] },
    // Lanche da manhã = 1 fruta + 1 proteína de lanche.
    lanche1: { nome: 'Lanche da manhã', comp: ['fruta', 'lancheProt'] },
    // Almoço = base + feijão + proteína + 2 verduras/legumes + azeite.
    almoco: { nome: 'Almoço', comp: ['base', 'feijao', 'prot', 'veg', 'veg', 'gordura'] },
    // Lanche da tarde = carboidrato + proteína de lanche + fruta.
    lanche2: { nome: 'Lanche da tarde', comp: ['lancheCarb', 'lancheProt', 'fruta'] },
    // Pré-treino = carboidrato de lanche + fruta (energia rápida).
    pre: { nome: 'Lanche pré-treino', comp: ['lancheCarb', 'fruta'] },
    // Jantar = base + proteína + 2 verduras/legumes + azeite (sem feijão).
    jantar: { nome: 'Jantar', comp: ['base', 'prot', 'veg', 'veg', 'gordura'] },
    // Ceia = só uma proteína leve.
    ceia: { nome: 'Ceia', comp: ['lancheProt'] }
  // Fim do objeto MEALS.
  };
  // Palavras gerais: se a pessoa escrever "peixe", saem TODOS os peixes, e assim por diante.
  /* palavras gerais que a pessoa pode digitar */
  // Objeto: palavra digitada -> função que diz se um alimento (i) se encaixa nessa palavra.
  const GENERIC = {
    // "carne vermelha" pega alimentos com a palavra 'vermelha'; "carne" pega vermelhas e porco.
    'carne vermelha': (i) => i.w.includes('vermelha'), carne: (i) => i.w.includes('vermelha') || i.w.includes('porco'),
    // "frutos do mar", "peixe" e "peixes" pegam tudo que tem a restrição 'peixe'.
    'frutos do mar': (i) => i.f.includes('peixe'), peixe: (i) => i.f.includes('peixe'), peixes: (i) => i.f.includes('peixe'),
    // "laticinio(s)" e "leite" pegam tudo que tem lactose.
    laticinio: (i) => i.f.includes('lactose'), laticinios: (i) => i.f.includes('lactose'), leite: (i) => i.f.includes('lactose'),
    // "ovo/ovos" pegam itens com ovo; "frango" pega itens com a palavra frango.
    ovo: (i) => i.f.includes('ovo'), ovos: (i) => i.f.includes('ovo'), frango: (i) => i.w.includes('frango'),
    // "fruta/frutas" pegam tudo que está no grupo de frutas.
    fruta: (i) => POOLS.fruta.includes(i), frutas: (i) => POOLS.fruta.includes(i),
    // "gluten" e "trigo" pegam tudo que tem glúten.
    gluten: (i) => i.f.includes('gluten'), trigo: (i) => i.f.includes('gluten'),
    // "legume(s)" e "verdura(s)" pegam itens marcados com essas palavras.
    legume: (i) => i.w.includes('legume'), legumes: (i) => i.w.includes('legume'), verdura: (i) => i.w.includes('verdura'), verduras: (i) => i.w.includes('verdura')
  // Fim do objeto GENERIC.
  };

  /* ================= estado ================= */
  // Todas as contas ficam em 'prumo:users'; quem está logado agora fica em 'prumo:session'.
  // Nomes das duas chaves usadas no localStorage.
  const KEY_USERS = 'prumo:users', KEY_SESS = 'prumo:session';
  // Carrega todas as contas salvas (ou um objeto vazio se for a primeira vez).
  let users = store.get(KEY_USERS, {});
  // Carrega o e-mail de quem estava logado (ou null).
  let email = store.get(KEY_SESS, null);
  // U = o objeto da pessoa logada, se houver e-mail salvo e a conta existir; senão null.
  let U = email && users[email] ? users[email] : null;

  // blank: respostas vazias de uma pessoa nova.
  // Função que devolve um objeto novo de respostas, com valores iniciais (3 dias de treino, nenhuma dieta, etapa 'esportes'...).
  const blank = () => ({ esportes: {}, nenhum: false, treinoDias: 3, aplicarTreino: null, foco: [], rotina: null, novo: null, dieta: null, step: 'esportes', reroll: {} });
  // save: se há alguém logado, coloca U dentro de 'users' e grava tudo no armazenamento.
  const save = () => { if (U) { users[U.email] = U; store.set(KEY_USERS, users); } };

  /* ================= IMC ================= */
  // imcInfo: recebe peso (kg) e altura (cm) e devolve o IMC, a classificação da OMS,
  // uma dica, a posição na régua colorida e a faixa de peso saudável para essa altura.
  // Função do IMC: recebe peso em kg e altura em cm.
  function imcInfo(peso, altCm) {
    // Converte altura para metros; se peso ou altura forem inválidos (0, NaN), devolve null.
    const h = altCm / 100; if (!(peso > 0 && h > 0)) return null;
    // Fórmula do IMC: peso ÷ (altura × altura).
    const v = peso / (h * h);
    // Declara as variáveis: categoria, classe CSS (cor) e dica.
    let cat, cls, tip;
    // IMC menor que 18,5: abaixo do peso (cor de alerta).
    if (v < 18.5) { cat = 'Abaixo do peso'; cls = 'warn'; tip = 'Foco em ganhar massa com treino de força e calorias suficientes.'; }
    // De 18,5 até 24,9: peso adequado (cor 'ok').
    else if (v < 25) { cat = 'Peso adequado'; cls = 'ok'; tip = 'Você está na faixa saudável. O plano vai mirar em condicionamento e composição corporal.'; }
    // De 25 até 29,9: sobrepeso (cor intermediária).
    else if (v < 30) { cat = 'Sobrepeso'; cls = 'mid'; tip = 'Um déficit calórico leve com treino de força costuma funcionar bem aqui.'; }
    // De 30 até 34,9: obesidade grau I.
    else if (v < 35) { cat = 'Obesidade grau I'; cls = 'warn'; tip = 'Começamos com exercícios de baixo impacto para proteger as articulações. Vale um check-up médico.'; }
    // De 35 até 39,9: obesidade grau II.
    else if (v < 40) { cat = 'Obesidade grau II'; cls = 'warn'; tip = 'Recomendamos acompanhamento médico. O treino começa com baixo impacto.'; }
    // 40 ou mais: obesidade grau III.
    else { cat = 'Obesidade grau III'; cls = 'warn'; tip = 'Procure acompanhamento médico antes de mudar treino e dieta. O plano aqui é só um ponto de partida.'; }
    // posição no medidor: 14% = 18,5 / 40% = 25 / 60% = 30 / 100% = 45
    // Variável que vai guardar a posição do marcador na régua (0 a 100%).
    let pos;
    // Abaixo de 18,5: espalha IMC 14 a 18,5 entre 0% e 14% da régua.
    if (v < 18.5) pos = clamp((v - 14) / 4.5, 0, 1) * 14;
    // De 18,5 a 25: espalha entre 14% e 40% (faixa de 26%).
    else if (v < 25) pos = 14 + (v - 18.5) / 6.5 * 26;
    // De 25 a 30: espalha entre 40% e 60%.
    else if (v < 30) pos = 40 + (v - 25) / 5 * 20;
    // 30 ou mais: espalha IMC 30 a 45 entre 60% e 100% (clamp impede passar de 100%).
    else pos = 60 + clamp((v - 30) / 15, 0, 1) * 40;
    // Peso mínimo e máximo saudáveis para essa altura (IMC 18,5 e 24,9 ao contrário: peso = IMC × altura²).
    const minP = 18.5 * h * h, maxP = 24.9 * h * h;
    // Devolve tudo num objeto: valor, categoria, classe, dica, posição e o texto da faixa saudável.
    return { v, cat, cls, tip, pos, faixa: `${fmt1(minP)} a ${fmt1(maxP)} kg` };
  // Fim da função imcInfo.
  }
  // Atualiza o IMC na tela de cadastro enquanto a pessoa digita.
  // Função chamada a cada tecla digitada nos campos de peso/altura do cadastro.
  function paintImcLive() {
    // Lê os campos de peso e altura, converte em número e calcula o IMC.
    const info = imcInfo(num($('#c-peso').value), num($('#c-altura').value));
    // Pega o marcador (pino) da régua.
    const pin = $('#imc-pin');
    // Se não deu para calcular: mostra "--", pede peso e altura, apaga a dica, esconde o pino e sai da função.
    if (!info) { $('#imc-num').textContent = '--'; $('#imc-cat').textContent = 'Digite peso e altura'; $('#imc-tip').textContent = ''; pin.style.opacity = 0; return; }
    // Mostra o valor do IMC com 1 casa decimal.
    $('#imc-num').textContent = fmt1(info.v);
    // Mostra a categoria (ex.: "Peso adequado").
    $('#imc-cat').textContent = info.cat;
    // Mostra a dica + a faixa de peso saudável.
    $('#imc-tip').textContent = `${info.tip} Faixa saudável para sua altura: ${info.faixa}.`;
    // Move o pino para a posição calculada (em %) e deixa ele visível.
    pin.style.left = info.pos + '%'; pin.style.opacity = 1;
  // Fim da função paintImcLive.
  }
  // Atualiza o IMC na barra verde da esquerda.
  // Função que atualiza o quadro de IMC da barra lateral verde.
  function paintRail() {
    // Pega o número e a etiqueta (pílula) da barra.
    const n = $('#rail-imc-num'), c = $('#rail-imc-cat');
    // Se há alguém logado, calcula o IMC dele; senão null.
    const info = U ? imcInfo(U.peso, U.altura) : null;
    // Sem IMC: mostra "--", pede os dados, volta a pílula ao estilo neutro e sai.
    // Pega o marcador da régua e o texto de peso/altura da barra.
    const pin = $('#rail-imc-pin'), meta = $('#rail-imc-meta');
    if (!info) { n.textContent = '--'; c.textContent = 'Sem dados'; c.className = 'pill'; pin.style.opacity = 0; meta.textContent = 'Preencha peso e altura no cadastro.'; return; }
    // Com IMC: mostra o número e a categoria, e põe a classe 'ok' (verde), 'mid' (amarela) ou 'warn' (terracota) na pílula.
    n.textContent = fmt1(info.v); c.textContent = info.cat; c.className = 'pill ' + info.cls;
    // Move o marcador da régua para a posição do IMC (em %) e deixa ele visível.
    pin.style.left = info.pos + '%'; pin.style.opacity = 1;
    // Mostra o peso (com vírgula) e a altura usados no cálculo.
    meta.textContent = `${String(U.peso).replace('.', ',')} kg e ${U.altura} cm`;
  // Fim da função paintRail.
  }

  /* ================= navegação ================= */
  // Lista das etapas, na ordem. 'opt: true' mostra a palavra "opcional".
  // Array com as 8 etapas do app, na ordem em que aparecem.
  const STEP_DEF = [
    // Etapas 1 a 3: conta, esportes e treino pronto.
    { id: 'conta', nome: 'Conta e IMC' }, { id: 'esportes', nome: 'Esportes' }, { id: 'treino', nome: 'Treino pronto' },
    // Etapas 4 a 6: região (opcional), rotina e novo esporte.
    { id: 'foco', nome: 'Região', opt: true }, { id: 'rotina', nome: 'Rotina e sono' }, { id: 'novo', nome: 'Novo esporte' },
    // Etapas 7 e 8: dieta e resumo final.
    { id: 'dieta', nome: 'Dieta' }, { id: 'resumo', nome: 'Meu plano' }
  // Fim da lista STEP_DEF.
  ];
  // Função curta: verdadeiro se há alguém logado E se ele marcou musculação ('!!' converte para true/false).
  const fazMusculacao = () => U && !!U.respostas.esportes.musculacao;
  // A etapa "Treino pronto" some para quem já faz musculação.
  // Devolve as etapas visíveis: tira a etapa 'treino' se a pessoa já faz musculação.
  function activeSteps() { return STEP_DEF.filter((s) => s.id !== 'treino' || !fazMusculacao()); }
  // Guarda o id da etapa que está na tela agora.
  let current = 'conta';
  // Devolve a lista de etapas que a pessoa já alcançou (ou lista vazia).
  const reached = () => (U ? U.respostas.reached || [] : []);

  // show: alterna entre a tela de abertura ('inicio') e o app ('app').
  function show(view) {
    // Esconde a abertura se a tela pedida não for 'inicio'.
    $('#view-inicio').hidden = view !== 'inicio';
    // Esconde o app se a tela pedida não for 'app'.
    $('#view-app').hidden = view !== 'app';
    // Rola a página de volta para o topo.
    window.scrollTo({ top: 0 });
  // Fim da função show.
  }
  // go: mostra uma etapa, esconde as outras, desenha o conteúdo dela e lembra onde a pessoa parou.
  // go(etapa): troca para a etapa indicada.
  function go(step) {
    // Guarda qual é a etapa atual.
    current = step;
    // Se há alguém logado: adiciona a etapa à lista de alcançadas (Set evita repetidos), guarda a última etapa (menos 'conta') e salva.
    if (U) { const r = new Set(reached()); r.add(step); U.respostas.reached = [...r]; if (step !== 'conta') U.respostas.step = step; save(); }
    // Garante que o app (e não a abertura) está visível.
    show('app');
    // Percorre todos os painéis e mostra só o que tem data-step igual à etapa pedida.
    $$('.panel').forEach((p) => { p.hidden = p.dataset.step !== step; });
    // Procura no objeto RENDER a função que desenha essa etapa e, se existir, executa.
    const render = RENDER[step]; if (render) render();
    // Redesenha a lista de etapas, a barra do IMC e o topo.
    paintSteps(); paintRail(); paintTop();
    // Coloca o foco do teclado no título (h2) da etapa — ajuda leitores de tela; preventScroll evita pulo de rolagem.
    const h = $(`.panel[data-step="${step}"] h2`); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  // Fim da função go.
  }
  // next: acha a posição da etapa atual e vai para a próxima, se houver.
  function next() { const a = activeSteps(); const i = a.findIndex((s) => s.id === current); if (i < a.length - 1) go(a[i + 1].id); }
  // back: volta uma etapa; se estiver na primeira etapa depois da conta, volta para a tela de abertura.
  function back() { const a = activeSteps(); const i = a.findIndex((s) => s.id === current); if (i > 1) go(a[i - 1].id); else show('inicio'); }
  // paintSteps: desenha a lista de etapas na barra verde.
  function paintSteps() {
    // Pega as etapas ativas, as alcançadas (como Set) e o índice da etapa atual.
    const a = activeSteps(); const r = new Set(reached()); const ci = a.findIndex((s) => s.id === current);
    // Monta o HTML de cada etapa e coloca dentro de <ol id="steps">.
    $('#steps').innerHTML = a.map((s, i) => {
      // 'done' = etapa que vem antes da atual (já concluída).
      const done = i < ci || (r.has(s.id) && s.id !== current && i < ci);
      // 'can' = pode clicar: precisa estar logado, não é a etapa 'conta' e já foi alcançada (ou vem antes da atual).
      const can = U && s.id !== 'conta' && (r.has(s.id) || i <= ci);
      // Gera o <li> com classes current/done, um botão (desabilitado se não puder clicar), a bolinha (✓ ou número), o nome e "opcional" se for o caso.
      // Situação da etapa, lida só pelo leitor de tela.
      const sit = s.id === current ? 'etapa atual' : i < ci ? 'feita' : 'por fazer';
      return `<li class="${s.id === current ? 'current' : ''} ${i < ci ? 'done' : ''}"><button type="button" data-step-go="${s.id}" ${can ? '' : 'disabled'} ${s.id === current ? 'aria-current="step"' : ''} title="${s.nome}"><span class="dot" aria-hidden="true">${i < ci ? '✓' : ''}</span><span class="label-txt">${s.nome}</span>${s.opt ? '<span class="opt">opcional</span>' : ''}<span class="sr-only">, ${sit}</span></button></li>`;
    // Fecha o map e junta os pedaços de HTML num texto só.
    }).join('');
    // Escreve "Etapa X de N" e, só no celular (CSS), o nome da etapa atual.
    const at = a[Math.max(ci, 0)];
    $('#rail-progresso').innerHTML = `Etapa ${Math.max(ci, 0) + 1} de ${a.length}<span class="prog-nome">: ${at ? at.nome : ''}</span>`;
  // Fim da função paintSteps.
  }
  // paintTop: ajusta a barra do topo conforme alguém esteja logado ou não.
  function paintTop() {
    // true se existe usuário logado.
    const logged = !!U;
    // Logado: esconde "Entrar" e mostra "Sair". Deslogado: o contrário.
    $('#btn-topo-entrar').hidden = logged; $('#btn-sair').hidden = !logged;
    // Mostra "Olá, Nome" só quando logado.
    const w = $('#who'); w.hidden = !logged; if (logged) w.textContent = 'Olá, ' + U.nome;
  // Fim da função paintTop.
  }

  /* ================= conta ================= */
  // setTab: alterna entre as abas "Criar conta" e "Entrar".
  function setTab(t) {
    // true se a aba pedida for 'criar'.
    const criar = t === 'criar';
    // Marca qual aba está selecionada (aria-selected muda o estilo e ajuda leitores de tela).
    $('#tab-criar').setAttribute('aria-selected', criar); $('#tab-entrar').setAttribute('aria-selected', !criar);
    // Mostra o formulário certo e esconde o outro.
    $('#form-criar').hidden = !criar; $('#form-entrar').hidden = criar;
    // Troca o título da etapa.
    $('#conta-title').textContent = criar ? 'Crie sua conta' : 'Entre na sua conta';
  // Fim da função setTab.
  }
  // Cadastro: confere cada campo, mostra o erro em português se algo estiver errado,
  // cria a conta e vai para a etapa de esportes.
  // Função chamada quando o formulário de cadastro é enviado.
  async function onCriar(e) {
    // Impede o comportamento padrão do formulário (recarregar a página).
    e.preventDefault();
    // Pega o parágrafo de erro e limpa qualquer erro anterior.
    const err = $('#criar-erro'); err.textContent = '';
    // Lê nome (sem espaços nas pontas), e-mail (normalizado) e senha.
    const nome = $('#c-nome').value.trim(), mail = norm($('#c-email').value), senha = $('#c-senha').value;
    // Lê idade, peso e altura convertendo para número.
    const idade = num($('#c-idade').value), peso = num($('#c-peso').value), altura = num($('#c-altura').value);
    // Lê o rádio de sexo marcado; '|| {}' evita erro se nenhum estiver marcado (value fica undefined).
    const sexo = ($('input[name="sexo"]:checked') || {}).value;
    // Validação: nome vazio -> mostra erro e sai.
    if (!nome) return (err.textContent = 'Escreva seu nome.');
    // Validação do e-mail com regex: algo@algo.algo, sem espaços.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return (err.textContent = 'Confira o e-mail: falta o @ ou o domínio.');
    // Validação: senha com pelo menos 6 caracteres.
    if (senha.length < 6) return (err.textContent = 'A senha precisa de pelo menos 6 caracteres.');
    // Validação: idade entre 14 e 100.
    if (!(idade >= 14 && idade <= 100)) return (err.textContent = 'Informe uma idade entre 14 e 100 anos.');
    // Validação: sexo precisa ser escolhido.
    if (!sexo) return (err.textContent = 'Escolha o sexo biológico. Ele muda o cálculo de calorias.');
    // Validação: peso entre 30 e 300 kg.
    if (!(peso >= 30 && peso <= 300)) return (err.textContent = 'Informe o peso em kg, entre 30 e 300.');
    // Validação: altura entre 120 e 230 cm.
    if (!(altura >= 120 && altura <= 230)) return (err.textContent = 'Informe a altura em centímetros, por exemplo 175.');
    // Validação: o e-mail não pode já existir neste navegador.
    if (users[mail]) return (err.textContent = 'Já existe uma conta com esse e-mail neste navegador. Use a aba Entrar.');
    // Cria o objeto do usuário, com a senha já em hash (await espera o hash ficar pronto) e respostas em branco.
    U = { nome, email: mail, senha: await hash(senha), idade, sexo, peso, altura, criado: Date.now(), respostas: blank() };
    // Marca que a pessoa já passou pela conta e pode ir para esportes.
    U.respostas.reached = ['conta', 'esportes'];
    // Guarda o e-mail como sessão ativa e salva tudo.
    email = mail; store.set(KEY_SESS, mail); save();
    // Mostra o toast com o IMC calculado.
    toast('Conta criada. IMC ' + fmt1(imcInfo(peso, altura).v));
    // Vai para a etapa de esportes.
    go('esportes');
  // Fim da função onCriar.
  }
  // Login: procura o e-mail, compara a senha embaralhada e, se a pessoa digitou
  // um peso novo, atualiza (o peso antigo vai para o histórico).
  // Função chamada quando o formulário de login é enviado.
  async function onEntrar(e) {
    // Impede o recarregamento da página.
    e.preventDefault();
    // Pega o parágrafo de erro do login e limpa.
    const err = $('#entrar-erro'); err.textContent = '';
    // Lê e-mail (normalizado) e senha digitados.
    const mail = norm($('#e-email').value), senha = $('#e-senha').value;
    // Recarrega as contas do armazenamento (caso tenham mudado em outra aba).
    users = store.get(KEY_USERS, users);
    // Procura a conta pelo e-mail.
    const u = users[mail];
    // Se não achou: mostra erro e sai.
    if (!u) return (err.textContent = 'Não achamos esse e-mail neste navegador. Crie uma conta na outra aba.');
    // Calcula o hash da senha digitada e compara com o salvo; se for diferente, erro.
    if (u.senha !== await hash(senha)) return (err.textContent = 'Senha incorreta. Tente de novo.');
    // Lê o campo opcional "peso de hoje".
    const p = num($('#e-peso').value);
    // Se o peso novo for válido: guarda o peso antigo (com data) no histórico e atualiza o peso.
    if (p >= 30 && p <= 300) { u.historico = (u.historico || []).concat({ data: Date.now(), peso: u.peso }); u.peso = p; }
    // Define a pessoa como logada, guarda a sessão e salva.
    U = u; email = mail; store.set(KEY_SESS, mail); save();
    // Mensagem de boas-vindas.
    toast('Bem-vindo de volta, ' + U.nome);
    // Se já tem dieta, vai direto ao resumo; senão volta à etapa onde parou (ou esportes).
    go(U.respostas.dieta ? 'resumo' : (U.respostas.step || 'esportes'));
  // Fim da função onEntrar.
  }
  // sair: limpa o usuário e a sessão, zera os formulários, atualiza IMC e topo, volta à abertura e avisa com toast.
  function sair() { U = null; email = null; store.del(KEY_SESS); ['#form-criar', '#form-entrar'].forEach((f) => $(f).reset()); paintImcLive(); paintTop(); show('inicio'); toast('Você saiu da conta'); }

  /* ================= esportes ================= */
  // Desenha os botões de esportes e, para cada um marcado, as perguntas de frequência.
  // renderEsportes: desenha a etapa de esportes.
  function renderEsportes() {
    // R = atalho para as respostas da pessoa.
    const R = U.respostas;
    // Para cada esporte cria um "chip" com checkbox (já marcado se a pessoa escolheu antes), ícone e nome...
    $('#sport-chips').innerHTML = SPORTS.map((s) => `<label class="chip"><input type="checkbox" value="${s.id}" ${R.esportes[s.id] ? 'checked' : ''}><span><span class="ico" aria-hidden="true">${s.ico}</span>${s.nome}</span></label>`).join('') +
      // ...e no final soma o chip especial "Não faço esporte".
      `<label class="chip none"><input type="checkbox" value="nenhum" ${R.nenhum ? 'checked' : ''}><span>Não faço esporte</span></label>`;
    // Desenha as perguntas de frequência dos esportes marcados.
    renderFreq();
  // Fim da função renderEsportes.
  }
  // renderFreq: desenha as linhas de frequência e duração.
  function renderFreq() {
    // Pega as respostas e a lista de ids dos esportes marcados.
    const R = U.respostas; const ids = Object.keys(R.esportes);
    // Se houver esportes marcados, começa com o título "Com que frequência?" e gera uma linha por esporte (senão fica vazio).
    $('#freq-list').innerHTML = ids.length ? `<p class="field-title">Com que frequência?</p>` + ids.map((id) => {
      // e = dados do esporte (vezes por semana e minutos).
      const e = R.esportes[id];
      // HTML gerado nas 3 linhas abaixo (comentário fora do texto para não aparecer na página):
      //   • 1ª linha: abre a <div> da linha e escreve o nome do esporte em negrito;
      //   • 2ª linha: <select> de 1 a 7 vezes por semana, já marcando o valor salvo;
      //   • 3ª linha: <select> de duração (30 min a 2 h), já marcando o valor salvo, e fecha a <div>.
      return `<div class="freq-row"><strong>${SPORT_BY[id].nome}</strong>
        <select aria-label="Vezes por semana de ${SPORT_BY[id].nome}" data-freq="${id}">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${e.vezes === n ? 'selected' : ''}>${n}× por semana</option>`).join('')}</select>
        <select aria-label="Duração de ${SPORT_BY[id].nome}" data-dur="${id}">${[[30, '30 min'], [45, '45 min'], [60, '1 hora'], [90, '1h30'], [120, '2 horas']].map(([n, l]) => `<option value="${n}" ${e.min === n ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    // Junta as linhas num texto só; se não houver esportes, usa '' (vazio).
    }).join('') : '';
  // Fim da função renderFreq.
  }
  // "Não faço esporte" desmarca todos os outros, e marcar um esporte desmarca "Não faço esporte".
  // Função chamada quando um checkbox de esporte muda.
  function onSportChange(e) {
    // inp = o elemento clicado; se não for checkbox, ignora.
    const inp = e.target; if (!inp.matches('input[type="checkbox"]')) return;
    // Atalho para as respostas.
    const R = U.respostas;
    // Se foi o chip "Não faço esporte"...
    if (inp.value === 'nenhum') {
      // ...guarda se ele está marcado ou não.
      R.nenhum = inp.checked;
      // Se marcou: apaga todos os esportes e desmarca os outros checkboxes.
      if (inp.checked) { R.esportes = {}; $$('#sport-chips input').forEach((i) => { if (i.value !== 'nenhum') i.checked = false; }); }
    // Se foi um esporte comum...
    } else {
      // ...e foi marcado: cria com padrão 2×/semana, 60 min, e desmarca "Não faço esporte".
      if (inp.checked) { R.esportes[inp.value] = { vezes: 2, min: 60 }; R.nenhum = false; const n = $('#sport-chips input[value="nenhum"]'); if (n) n.checked = false; }
      // ...e foi desmarcado: remove o esporte das respostas.
      else delete R.esportes[inp.value];
    // Fim do if/else.
    }
    // Limpa a mensagem de erro da etapa.
    $('#esportes-erro').textContent = '';
    // Salva e redesenha frequências e lista de etapas.
    save(); renderFreq(); paintSteps();
  // Fim da função onSportChange.
  }
  // Função chamada quando muda um <select> de frequência ou duração.
  function onFreqChange(e) {
    // t = o select alterado; R = respostas.
    const t = e.target, R = U.respostas;
    // Se o select tem data-freq, atualiza as vezes por semana daquele esporte ('+' converte texto em número).
    if (t.dataset.freq) R.esportes[t.dataset.freq].vezes = +t.value;
    // Se tem data-dur, atualiza a duração em minutos.
    if (t.dataset.dur) R.esportes[t.dataset.dur].min = +t.value;
    // Salva.
    save();
  // Fim da função onFreqChange.
  }

  /* ================= treino ================= */
  // Monta o treino: escolhe os treinos pelo número de dias, define os dias da semana,
  // acrescenta exercícios da região escolhida e troca o cardio para baixo impacto se IMC >= 30.
  // buildTreino: monta e devolve o objeto do treino.
  function buildTreino() {
    // Pega as respostas e calcula o IMC.
    const R = U.respostas; const info = imcInfo(U.peso, U.altura);
    // Número de dias de treino (padrão 3).
    const dias = R.treinoDias || 3;
    // Escolhe quais treinos do objeto EX usar: 2 dias = corpo todo, 3 dias = A/B/C, 4 dias = superiores/inferiores.
    const keys = dias === 2 ? ['fullA', 'fullB'] : dias === 3 ? ['A', 'B', 'C'] : ['up1', 'lo1', 'up2', 'lo2'];
    // lowImpact = true se o IMC for 30 ou mais.
    const lowImpact = info && info.v >= 30;
    // Cardio: bicicleta/elíptico se for baixo impacto, senão esteira/corrida leve.
    const cardio = lowImpact ? ['Bicicleta ou elíptico, ritmo moderado', '20–30 min'] : ['Esteira inclinada ou corrida leve', '15–20 min'];
    // fds = true se a pessoa escolheu treinar nos fins de semana.
    const fds = R.rotina && R.rotina.hora === 'fds';
    // Define em quais dias da semana (índices de DIAS) cai cada treino, conforme fds e número de dias.
    const diasIdx = fds ? { 2: [5, 6], 3: [2, 5, 6], 4: [1, 3, 5, 6] }[dias] : { 2: [1, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4] }[dias];
    // Pega as regiões escolhidas que têm exercícios extras (rosto não tem).
    const focos = (R.foco || []).filter((f) => FOCO_EX[f] && FOCO_EX[f].length);
    // Para cada treino escolhido, monta a versão final:
    const treinos = keys.map((k, i) => {
      // base = treino original; ex = cópia da lista de exercícios em formato {n: nome, s: séries}.
      const base = EX[k]; const ex = base.ex.map(([n, s]) => ({ n, s }));
      // Para cada região escolhida...
      focos.forEach((f) => {
        // ...vê em que tipo de treino ela se encaixa.
        const g = FOCO_GRUPO[f];
        // Se combina com este treino, adiciona os exercícios extras (sem repetir) marcados com extra: true.
        if (g === 'any' || base.grupo === g || base.grupo === 'full') FOCO_EX[f].forEach(([n, s]) => { if (!ex.some((e) => e.n === n)) ex.push({ n, s, extra: true }); });
      // Fim do forEach das regiões.
      });
      // Devolve o treino com tudo do original (...base), a nova lista, o dia da semana e o cardio.
      return { ...base, ex, dia: DIAS[diasIdx[i]], cardio };
    // Fim do map dos treinos.
    });
    // Tempo de descanso entre séries (maior para baixo impacto).
    const descanso = lowImpact ? '60–90 s entre séries' : '45–75 s entre séries';
    // Devolve o pacote completo do treino.
    return { treinos, diasIdx, descanso, lowImpact, dias };
  // Fim da função buildTreino.
  }
  // weekHTML: desenha a faixa com os 7 dias da semana; 'extra' marca dias de esporte.
  function weekHTML(diasIdx, extra = {}) {
    // Abre a <div class="week"> e gera uma caixinha por dia.
    return `<div class="week">${DIAS.map((d, i) => {
      // t = posição do dia na lista de dias de treino (-1 se não tiver treino).
      const t = diasIdx.indexOf(i);
      // Caixa do dia: classe 'on' se tem treino (mostra letra A, B, C... via código 65+t), 'sport' se tem esporte (•), senão '–'.
      return `<div class="${t >= 0 ? 'on' : extra[i] ? 'sport' : ''}">${d}<b>${t >= 0 ? String.fromCharCode(65 + t) : extra[i] ? '•' : '–'}</b></div>`;
    // Junta tudo e fecha a <div>.
    }).join('')}</div>`;
  // Fim da função weekHTML.
  }
  // treinoHTML: gera o HTML completo do treino.
  function treinoHTML(T) {
    // HTML gerado nas linhas abaixo (comentário fora do texto para não aparecer na página):
    //   • 1ª linha: a faixa da semana (weekHTML);
    //   • 2ª linha: abre a grade de treinos e, para cada treino, um <article> com cabeçalho (nome · dia e foco);
    //   • 3ª linha: a lista <ul> de exercícios (classe 'extra' nos da região escolhida), nome protegido com esc();
    //   • 4ª linha: rodapé do cartão com aquecimento e o cardio; fecha o article e a grade;
    //   • 5ª linha: nota com descanso e dicas; se for baixo impacto, acrescenta a explicação sobre IMC acima de 30.
    return `${weekHTML(T.diasIdx)}
      <div class="workouts">${T.treinos.map((t) => `<article class="wo"><div class="wo-head"><strong>${t.nome} · ${t.dia}</strong><span>${t.foco}</span></div>
        <ul>${t.ex.map((e) => `<li class="${e.extra ? 'extra' : ''}"><span>${esc(e.n)}</span><em>${e.s}</em></li>`).join('')}</ul>
        <div class="wo-foot">Aquecimento 5–10 min · Cardio no final: ${t.cardio[0].toLowerCase()}, ${t.cardio[1]}</div></article>`).join('')}</div>
      <p class="note">Descanso: ${T.descanso}. Use uma carga em que as 2 últimas repetições fiquem difíceis, mas com a postura certa. Nas primeiras semanas, peça ajuda ao instrutor da academia para ajustar as máquinas.${T.lowImpact ? ' Como seu IMC está acima de 30, o cardio é de baixo impacto para poupar joelhos e tornozelos.' : ''}</p>`;
  // Fim da função treinoHTML.
  }
  // renderTreino: desenha a etapa "Treino pronto".
  function renderTreino() {
    // Atalho para as respostas.
    const R = U.respostas;
    // Marca o rádio de dias (2, 3 ou 4) que bate com o salvo.
    $$('#treino-dias input').forEach((i) => { i.checked = +i.value === (R.treinoDias || 3); });
    // Monta o treino e coloca o HTML dentro de #treino-out.
    $('#treino-out').innerHTML = treinoHTML(buildTreino());
  // Fim da função renderTreino.
  }

  /* ================= foco ================= */
  // renderFoco: desenha os chips das regiões do corpo.
  function renderFoco() {
    // Atalho para as respostas.
    const R = U.respostas;
    // Cria um chip com checkbox por região, já marcado se estiver salvo em R.foco.
    $('#foco-chips').innerHTML = FOCOS.map((f) => `<label class="chip"><input type="checkbox" value="${f.id}" ${R.foco.includes(f.id) ? 'checked' : ''}><span>${f.nome}</span></label>`).join('');
  // Fim da função renderFoco.
  }

  /* ================= rotina ================= */
  // Lê os horários e escolhas do formulário de rotina.
  // readRotina: lê o formulário de rotina e devolve um objeto.
  function readRotina() {
    // Começa o objeto de retorno.
    return {
      // Horários de acordar, início, almoço e fim (com valores padrão se vazios).
      acorda: $('#r-acorda').value || '06:30', inicio: $('#r-inicio').value, almoco: $('#r-almoco').value || '12:00', fim: $('#r-fim').value,
      // Horário de dormir (padrão 23:00) e deslocamento em minutos ('+' converte em número).
      dorme: $('#r-dorme').value || '23:00', desloc: +$('#r-desloc').value,
      // Tipo de atividade no trabalho (padrão 'sentado').
      ativ: ($('input[name="ativ"]:checked') || {}).value || 'sentado',
      // Melhor horário para treinar (padrão 'noite').
      hora: ($('input[name="hora"]:checked') || {}).value || 'noite',
      // Se toma café da manhã (padrão 'sim').
      cafe: ($('input[name="cafe"]:checked') || {}).value || 'sim'
    // Fim do objeto.
    };
  // Fim da função readRotina.
  }
  // sonoHoras: minutos entre dormir e acordar; se der negativo soma 24 h (1440 min); divide por 60 para virar horas.
  function sonoHoras(r) { let d = toMin(r.acorda) - toMin(r.dorme); if (d <= 0) d += 1440; return d / 60; }
  // paintSono: mostra quantas horas a pessoa dorme.
  function paintSono() {
    // Lê a rotina e calcula as horas de sono.
    const r = readRotina(); const h = sonoHoras(r);
    // Monta o texto "7h30": horas inteiras + minutos da parte decimal.
    const hTxt = `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
    // Etiqueta: "Pouco sono" (< 7 h), "Muito sono" (> 9,5 h) ou "Bom".
    const tag = h < 7 ? '<span class="tag warn">Pouco sono</span>' : h > 9.5 ? '<span class="tag accent">Muito sono</span>' : '<span class="tag">Bom</span>';
    // Mensagem explicativa conforme a faixa.
    const msg = h < 7 ? 'Adultos precisam de 7 a 9 horas. Dormir pouco aumenta a fome e atrapalha a recuperação do treino.' : h > 9.5 ? 'Mais de 9h30 com frequência pode indicar cansaço acumulado. Vale observar.' : 'Está na faixa de 7 a 9 horas recomendada para adultos.';
    // Escreve tudo dentro de #sono-out.
    $('#sono-out').innerHTML = `<strong>Você dorme ${hTxt} por noite.</strong> ${tag} <span class="muted">${msg}</span>`;
  // Fim da função paintSono.
  }
  // renderRotina: preenche o formulário com a rotina salva.
  function renderRotina() {
    // Se ainda não há rotina salva, só mostra o sono com os valores padrão e sai.
    const r = U.respostas.rotina; if (!r) { paintSono(); return; }
    // Preenche os campos de horário e deslocamento.
    $('#r-acorda').value = r.acorda; $('#r-inicio').value = r.inicio; $('#r-almoco').value = r.almoco; $('#r-fim').value = r.fim; $('#r-dorme').value = r.dorme; $('#r-desloc').value = r.desloc;
    // Marca os rádios de atividade, horário de treino e café conforme o salvo.
    ['ativ', 'hora', 'cafe'].forEach((n) => { const i = $(`input[name="${n}"][value="${r[n]}"]`); if (i) i.checked = true; });
    // Atualiza o texto do sono.
    paintSono();
  // Fim da função renderRotina.
  }

  /* agenda do dia: horários de refeições e treino a partir da rotina */
  // agenda: monta o dia hora a hora (acordar, refeições, treino, dormir) a partir da rotina.
  // Regras principais:
  //  - café 30 min depois de acordar (ou depois do treino, se treina de manhã);
  //  - lanche entra se passar mais de ~3h20 entre duas refeições;
  //  - quem treina à noite ganha um lanche pré-treino 1h antes e janta depois do treino;
  //  - horários de refeição e treino são arredondados para 15 minutos.
  // agenda: devolve a lista de eventos do dia, em ordem de horário.
  function agenda() {
    // Usa a rotina salva (ou lê do formulário se ainda não salvou).
    const R = U.respostas, r = R.rotina || readRotina();
    // Converte acordar e dormir em minutos; se dormir for "antes" de acordar (passa da meia-noite), soma 24 h.
    const wake = toMin(r.acorda); let sleep = toMin(r.dorme); if (sleep <= wake) sleep += 1440;
    // hasWork = true se a pessoa informou início e fim do trabalho.
    const hasWork = r.inicio && r.fim;
    // Início e fim do trabalho (ou padrões: 2 h e 10 h após acordar); se o fim for antes do início (turno da noite), soma 24 h.
    const ini = hasWork ? toMin(r.inicio) : wake + 120; let fim = hasWork ? toMin(r.fim) : wake + 600; if (fim < ini) fim += 1440;
    // Horário do almoço em minutos.
    const alm = toMin(r.almoco);
    // Deslocamento em minutos (0 se vazio).
    const desloc = r.desloc || 0;
    // Lista de eventos, começa vazia.
    const ev = [];
    // Primeiro evento: acordar.
    ev.push({ t: wake, k: 'sono', titulo: 'Acordar', det: '' });

    // Tem treino de academia aplicado? (aceitou o treino e não faz musculação).
    const temTreinoAcad = R.aplicarTreino === true && !fazMusculacao();
    // Pratica algum esporte?
    const temEsporte = Object.keys(R.esportes).length > 0;
    // Início do treino (ainda não definido) e duração padrão de 70 min.
    let treinoIni = null, treinoDur = 70;
    // Se tem treino ou esporte, calcula o horário:
    if (temTreinoAcad || temEsporte) {
      // Manhã: antes do trabalho, descontando deslocamento, duração e 30 min de folga (mas nunca antes de 30 min após acordar).
      if (r.hora === 'manha') treinoIni = Math.max(wake + 30, ini - desloc - treinoDur - 30);
      // Almoço: começa 10 min antes do almoço e dura só 50 min.
      else if (r.hora === 'almoco') { treinoIni = alm - 10; treinoDur = 50; }
      // Noite: 30 min após chegar em casa, mas no máximo 3 h antes de dormir.
      else if (r.hora === 'noite') treinoIni = Math.min(fim + desloc + 30, sleep - 180);
      // Fim de semana: não entra no dia útil.
      else treinoIni = null; // fins de semana
    // Fim do if.
    }
    // Nome do evento de treino: "Treino de academia" ou os nomes dos esportes (só a parte antes de " /").
    const treinoLabel = temTreinoAcad ? 'Treino de academia' : temEsporte ? Object.keys(R.esportes).map((id) => SPORT_BY[id].nome.split(' /')[0]).join(' / ') : '';
    // Dias do treino em texto (ex.: "Seg, Qua, Sex").
    const diasTxt = temTreinoAcad ? buildTreino().diasIdx.map((i) => DIAS[i]).join(', ') : '';

    // café
    // Café: depois do treino se treina de manhã; senão 30 min após acordar.
    const cafeT = treinoIni !== null && r.hora === 'manha' ? treinoIni + treinoDur + 10 : wake + 30;
    // Adiciona o café se a pessoa toma café ou se treina de manhã.
    if (r.cafe === 'sim' || r.hora === 'manha') ev.push({ t: cafeT, k: 'refeicao', meal: 'cafe' });
    // Adiciona o começo do trabalho, com o horário de sair de casa se houver deslocamento.
    if (hasWork) ev.push({ t: ini, k: 'rotina', titulo: 'Começo do trabalho/estudo', det: desloc ? `saia de casa por volta de ${hhmm(ini - desloc)}` : '' });
    // Almoço: depois do treino se treina no almoço; senão no horário normal.
    const almT = r.hora === 'almoco' && treinoIni !== null ? treinoIni + treinoDur + 10 : alm;
    // Se passar 200 min (3h20) ou mais entre café e almoço, coloca um lanche no meio.
    if (almT - cafeT >= 200) ev.push({ t: Math.round((cafeT + almT) / 2), k: 'refeicao', meal: 'lanche1' });
    // Adiciona o almoço.
    ev.push({ t: almT, k: 'refeicao', meal: 'almoco' });

    // Variável do horário do jantar.
    let jantarT;
    // Se treina à noite...
    if (r.hora === 'noite' && treinoIni !== null) {
      // ...lanche pré-treino 1 h antes do treino;
      ev.push({ t: treinoIni - 60, k: 'refeicao', meal: 'pre' });
      // ...jantar 30 min depois de terminar o treino;
      jantarT = treinoIni + treinoDur + 30;
      // ...e um lanche da tarde se sobrar 4 h ou mais entre almoço e pré-treino.
      if (treinoIni - 60 - almT >= 240) ev.push({ t: Math.round((almT + treinoIni - 60) / 2), k: 'refeicao', meal: 'lanche2' });
    // Se não treina à noite...
    } else {
      // ...jantar 1 h após chegar em casa, mas pelo menos 5 h depois do almoço e 2 h antes de dormir;
      jantarT = clamp(fim + desloc + 60, almT + 300, sleep - 120);
      // ...e lanche da tarde no meio entre almoço e jantar.
      ev.push({ t: Math.round((almT + jantarT) / 2), k: 'refeicao', meal: 'lanche2' });
    // Fim do if/else.
    }
    // Adiciona o fim do trabalho.
    if (hasWork) ev.push({ t: fim, k: 'rotina', titulo: 'Fim do trabalho/estudo', det: '' });
    // Adiciona o treino, se houver horário, com os dias e duração (ou "nos dias em que você pratica" para esportes).
    if (treinoIni !== null) ev.push({ t: treinoIni, k: 'treino', titulo: treinoLabel, det: temTreinoAcad ? `${diasTxt} · cerca de ${treinoDur} min` : 'nos dias em que você pratica' });
    // Adiciona o jantar.
    ev.push({ t: jantarT, k: 'refeicao', meal: 'jantar' });
    // Se sobrar 3h30 ou mais entre jantar e dormir, coloca uma ceia 1 h antes de dormir.
    if (sleep - jantarT >= 210) ev.push({ t: sleep - 60, k: 'refeicao', meal: 'ceia' });
    // Lembrete de desligar telas 30 min antes de dormir.
    ev.push({ t: sleep - 30, k: 'rotina', titulo: 'Desligar telas', det: 'ajuda a pegar no sono' });
    // Último evento: dormir, com as horas de sono (tira o ",0" de números inteiros).
    ev.push({ t: sleep, k: 'sono', titulo: 'Dormir', det: `${fmt1(sonoHoras(r)).replace(',0', '')} h de sono` });
    // Arredonda refeições e treino para múltiplos de 15 min.
    ev.forEach((e) => { if (e.k === 'refeicao' || e.k === 'treino') e.t = Math.round(e.t / 15) * 15; });
    // Ordena os eventos do mais cedo para o mais tarde.
    ev.sort((a, b) => a.t - b.t);
    // Devolve os eventos e algumas informações extras.
    return { ev, fds: r.hora === 'fds', treinoLabel, temTreinoAcad };
  // Fim da função agenda.
  }

  /* ================= novo esporte / academias ================= */
  // renderNovo: desenha a etapa "Novo esporte".
  function renderNovo() {
    // n = respostas dessa etapa (pode ser null).
    const n = U.respostas.novo;
    // Preenche o <select> de esportes com uma opção por esporte.
    $('#n-esporte').innerHTML = SPORTS.map((s) => `<option value="${s.id}">${s.nome}</option>`).join('');
    // quer = true se a pessoa disse que quer um esporte novo.
    const quer = n && n.quer;
    // Marca o rádio "Sim" ou "Não" conforme o salvo.
    $$('#novo-quer input').forEach((i) => { i.checked = i.value === (quer ? 'sim' : 'nao'); });
    // Mostra o formulário de busca só se quer = true.
    $('#form-novo').hidden = !quer;
    // Se há dados salvos, preenche esporte, cidade e bairro.
    if (n) { if (n.esporte) $('#n-esporte').value = n.esporte; $('#n-cidade').value = n.cidade || ''; $('#n-bairro').value = n.bairro || ''; }
    // Se já buscou antes, mostra de novo o cartão de lugares.
    if (n && n.cidade && n.bairro && quer) $('#novo-out').innerHTML = placesHTML(n);
  // Fim da função renderNovo.
  }
  // Monta os links do Google Maps e do Google com a busca já pronta.
  // Link de busca no Google Maps; encodeURIComponent troca espaços e acentos por códigos seguros para URL.
  const mapsUrl = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  // Link de busca no Google.
  const googleUrl = (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q);
  // Desenha o cartão de "lugares perto": botões de busca, mensagem pronta e passo a passo de contato.
  // placesHTML: devolve o HTML do cartão de lugares.
  function placesHTML(n) {
    // s = o esporte escolhido; terms = os termos de busca dele (ou o próprio nome, se não houver).
    const s = SPORT_BY[n.esporte]; const terms = SEARCH_TERMS[n.esporte] || [s.nome];
    // Texto "Bairro, Cidade".
    const lugar = `${n.bairro}, ${n.cidade}`;
    // Mensagem pronta para mandar no WhatsApp, com bairro e nome do esporte em minúsculas.
    const msg = `Olá! Encontrei vocês pelo Google Maps. Moro no ${n.bairro} e quero começar ${s.nome.split(' /')[0].toLowerCase()}. Vocês têm aula experimental? Quais são os horários e valores?`;
    // HTML gerado nas linhas abaixo (comentário fora do texto para não aparecer na página):
    //   • abre o cartão .places;
    //   • cabeçalho com título "Esporte perto de Bairro, Cidade" e etiqueta "Abre no Google Maps";
    //   • parágrafo explicando o que cada busca mostra;
    //   • abre a grade de links;
    //   • um link por termo de busca (o primeiro com a classe 'main', verde), abrindo em nova aba (target=_blank, rel=noopener por segurança);
    //   • link para buscar contatos e WhatsApp no Google;
    //   • link para buscar avaliações (Reclame Aqui ou avaliações);
    //   • fecha a grade de links;
    //   • abre o bloco da mensagem;
    //   • título "Mensagem pronta para enviar";
    //   • caixa com o texto da mensagem (protegido com esc);
    //   • botão "Copiar mensagem";
    //   • fecha o bloco da mensagem;
    //   • lista numerada com os 3 passos para entrar em contato;
    //   • fecha o cartão.
    return `<div class="places card">
      <div class="card-head"><h3>${esc(s.nome)} perto de ${esc(lugar)}</h3><span class="tag accent">Abre no Google Maps</span></div>
      <p class="muted">Cada busca abre o mapa com os lugares mais próximos do seu bairro, com telefone, WhatsApp, horários e avaliações de cada um.</p>
      <div class="place-links">
        ${terms.map((t, i) => `<a class="plink ${i === 0 ? 'main' : ''}" href="${mapsUrl(`${t} perto de ${lugar}`)}" target="_blank" rel="noopener"><strong>${esc(t[0].toUpperCase() + t.slice(1))}</strong><span>no mapa, perto de ${esc(n.bairro)}</span></a>`).join('')}
        <a class="plink" href="${googleUrl(`${terms[0]} ${lugar} whatsapp`)}" target="_blank" rel="noopener"><strong>Contatos e WhatsApp</strong><span>busca no Google com telefone</span></a>
        <a class="plink" href="${googleUrl(`${terms[0]} ${n.cidade} reclame aqui OR avaliações`)}" target="_blank" rel="noopener"><strong>Avaliações</strong><span>o que outros alunos dizem</span></a>
      </div>
      <div class="msg">
        <strong>Mensagem pronta para enviar</strong>
        <div class="msg-box" id="msg-box">${esc(msg)}</div>
        <div><button class="btn btn-line btn-sm" type="button" id="copiar-msg">Copiar mensagem</button></div>
      </div>
      <ol class="steps-mini"><li>Abra a busca no mapa e escolha 2 ou 3 lugares perto.</li><li>Toque em "Ligar" ou no ícone do WhatsApp na ficha do lugar.</li><li>Cole a mensagem acima e peça uma aula experimental.</li></ol>
    </div>`;
  // Fim da função placesHTML.
  }

  /* ================= dieta ================= */
  // Calorias do dia:
  //  1) gasto parado (fórmula Mifflin-St Jeor: peso, altura, idade, sexo);
  //  2) × fator de atividade (sobe com as horas de esporte por semana e o tipo de trabalho);
  //  3) objetivo: perder = -20%, ganhar = +10%;
  //  4) nunca abaixo de 1.200 kcal (mulheres) / 1.500 kcal (homens).
  // kcalAlvo: calcula as calorias e proteína do dia.
  function kcalAlvo() {
    // Pega as respostas e a rotina.
    const R = U.respostas; const r = R.rotina || readRotina();
    // TMB (gasto em repouso) pela fórmula Mifflin-St Jeor: +5 para homens, -161 para mulheres.
    const tmb = 10 * U.peso + 6.25 * U.altura - 5 * U.idade + (U.sexo === 'm' ? 5 : -161);
    // Soma as horas de esporte por semana: vezes × (minutos ÷ 60) de cada esporte.
    let sessoes = Object.values(R.esportes).reduce((a, e) => a + e.vezes * (e.min / 60), 0);
    // Se aplicou o treino de academia, soma ~1,1 h por dia de treino.
    if (R.aplicarTreino && !fazMusculacao()) sessoes += (R.treinoDias || 3) * 1.1;
    // Fator de atividade: 1,2 (sedentário) até 1,725 (muito ativo), conforme as horas por semana.
    let fator = sessoes < 1 ? 1.2 : sessoes < 3 ? 1.375 : sessoes < 6 ? 1.55 : 1.725;
    // Aumenta o fator se a pessoa trabalha em pé (+0,075) ou faz trabalho físico (+0,15).
    if (r.ativ === 'pe') fator += 0.075; if (r.ativ === 'pesado') fator += 0.15;
    // GET = gasto total do dia = TMB × fator.
    const get = tmb * fator;
    // Objetivo salvo (padrão 'perder').
    const obj = (R.dieta && R.dieta.obj) || 'perder';
    // Calcula o IMC para o aviso abaixo.
    const info = imcInfo(U.peso, U.altura);
    // Meta: 80% do gasto para perder, 110% para ganhar, 100% para manter.
    let alvo = obj === 'perder' ? get * 0.8 : obj === 'ganhar' ? get * 1.1 : get;
    // Piso mínimo de calorias: 1500 (homens) ou 1200 (mulheres).
    const piso = U.sexo === 'm' ? 1500 : 1200;
    // Se a meta ficou abaixo do piso, sobe para o piso.
    if (alvo < piso) alvo = piso;
    // E nunca abaixo da própria TMB.
    alvo = Math.max(alvo, tmb);
    // Aviso: quer perder peso mas já está abaixo do peso.
    const avisoBaixo = obj === 'perder' && info && info.v < 18.5;
    // Devolve TMB, GET, meta arredondada para dezena, proteína (1,4 g/kg para manter, 1,7 g/kg nos outros) e o aviso.
    return { tmb: Math.round(tmb), get: Math.round(get), alvo: Math.round(alvo / 10) * 10, prot: Math.round(U.peso * (obj === 'manter' ? 1.4 : 1.7)), avisoBaixo };
  // Fim da função kcalAlvo.
  }
  // Separa o texto "não gosto" em palavras: "peixe, beterraba e queijo" -> ['peixe','beterraba','queijo'].
  // parseNao: recebe o texto de "não gosto".
  function parseNao(txt) {
    // Normaliza, separa por vírgula, ponto e vírgula, quebra de linha ou " e ", tira espaços e descarta palavras com menos de 3 letras.
    return norm(txt).split(/[,;\n]|\s+e\s+/).map((s) => s.trim()).filter((s) => s.length >= 3);
  // Fim da função parseNao.
  }
  // Diz se um alimento deve sair do cardápio (por restrição ou por "não gosto") e por quê.
  // itemBloqueado: devolve o motivo do bloqueio (texto) ou null se o alimento pode ficar.
  function itemBloqueado(item, termos, restr) {
    // Vegetariano: bloqueia carne e peixe.
    if (restr.includes('vegetariano') && (item.f.includes('carne') || item.f.includes('peixe'))) return 'vegetariano';
    // Vegano: bloqueia carne, peixe, ovo e lactose.
    if (restr.includes('vegano') && (item.f.includes('carne') || item.f.includes('peixe') || item.f.includes('ovo') || item.f.includes('lactose'))) return 'vegano';
    // Sem lactose: bloqueia laticínios.
    if (restr.includes('lactose') && item.f.includes('lactose')) return 'sem lactose';
    // Sem glúten: bloqueia itens com glúten.
    if (restr.includes('gluten') && item.f.includes('gluten')) return 'sem glúten';
    // Nome do alimento normalizado (sem acento, minúsculo).
    const nomeN = norm(item.n);
    // Para cada palavra que a pessoa escreveu...
    for (const t of termos) {
      // ...se for uma palavra geral (GENERIC) e o alimento se encaixa, bloqueia;
      if (GENERIC[t] && GENERIC[t](item)) return t;
      // ...se o nome do alimento contém a palavra, bloqueia;
      if (nomeN.includes(t)) return t;
      // ...se alguma palavra de busca do alimento é igual, ou começa com a palavra (ou vice-versa, com 4+ letras), bloqueia.
      if (item.w.some((w) => w.length >= 3 && (w === t || (t.length >= 4 && (w.startsWith(t) || t.startsWith(w)))))) return t;
    // Fim do for.
    }
    // Nada bloqueou: devolve null.
    return null;
  // Fim da função itemBloqueado.
  }
  // Monta a dieta: tira os alimentos bloqueados, pega os horários da agenda, divide as calorias
  // entre as refeições (café 25%, almoço 30%, jantar 24%...) e ajusta as quantidades.
  // O botão "Trocar opção" soma 1 em R.reroll da refeição, o que faz escolher outros alimentos.
  // montarDieta: monta e devolve o cardápio do dia.
  function montarDieta() {
    // Pega respostas, dieta, palavras de "não gosto" e restrições.
    const R = U.respostas; const D = R.dieta; const termos = parseNao(D.nao); const restr = D.restr || [];
    // Map para guardar os alimentos removidos e o motivo.
    const removidos = new Map();
    // Objeto para os grupos de alimentos já filtrados.
    const pools = {};
    // Percorre cada grupo de POOLS (k = nome do grupo, list = alimentos)...
    for (const [k, list] of Object.entries(POOLS)) {
      // ...e mantém só os que não estão bloqueados; os bloqueados vão para 'removidos'.
      pools[k] = list.filter((it) => { const b = itemBloqueado(it, termos, restr); if (b) { removidos.set(it.n, b); return false; } return true; });
    // Fim do for.
    }
    // Calcula as calorias-alvo.
    const K = kcalAlvo();
    // Monta a agenda do dia.
    const ag = agenda();
    // Pega só os eventos de refeição.
    const mealEv = ag.ev.filter((e) => e.k === 'refeicao');
    // Porcentagem das calorias do dia para cada refeição.
    const SHARE = { cafe: 25, lanche1: 9, almoco: 30, lanche2: 10, pre: 9, jantar: 24, ceia: 6 };
    // Soma as porcentagens das refeições que realmente existem hoje (para redistribuir se alguma faltar).
    const totShare = mealEv.reduce((a, e) => a + SHARE[e.meal], 0);
    // Set dos grupos que ficaram sem nenhuma opção.
    const faltas = new Set();
    // Para cada refeição (e = evento, mi = índice)...
    const refeicoes = mealEv.map((e, mi) => {
      // ...pega a definição da refeição e calcula as calorias-alvo dela.
      const def = MEALS[e.meal]; const alvo = K.alvo * SHARE[e.meal] / totShare;
      // seed = quantas vezes a pessoa clicou "Trocar opção" nessa refeição.
      const seed = (R.reroll[e.meal] || 0);
      // Set de alimentos já usados nesta refeição (para não repetir).
      const usados = new Set();
      // Lista de itens escolhidos.
      const itens = [];
      // Para cada grupo que compõe a refeição (c = grupo, ci = índice)...
      def.comp.forEach((c, ci) => {
        // ...pega os alimentos do grupo que ainda não foram usados;
        const pool = pools[c].filter((it) => !usados.has(it.n));
        // ...se não sobrou nenhum: anota a falta (se o grupo ficou vazio por restrição) e pula;
        if (!pool.length) { if (pools[c].length === 0) faltas.add(c); return; }
        // ...escolhe um índice "pseudo-aleatório" fixo com seed, posições e tamanho do nome (sempre igual até trocar);
        const idx = (seed * 3 + mi * 5 + ci * 7 + (U.nome.length)) % pool.length;
        // ...pega o alimento, marca como usado e coloca uma cópia na lista.
        const it = pool[idx]; usados.add(it.n); itens.push({ ...it });
      // Fim do forEach dos grupos.
      });
      // Soma as calorias dos itens de quantidade fixa.
      const fixo = itens.filter((i) => !i.s).reduce((a, i) => a + i.k, 0);
      // Soma as calorias dos itens que escalam.
      const esc_ = itens.filter((i) => i.s).reduce((a, i) => a + i.k, 0);
      // Fator de escala para bater a meta (limitado entre 0,5× e 2,4×); 1 se nada escala.
      const fator = esc_ ? clamp((alvo - fixo) / esc_, 0.5, 2.4) : 1;
      // Total de calorias da refeição.
      let total = 0;
      // Para cada item, calcula a quantidade final:
      const out = itens.map((i) => {
        // Começa com a quantidade e calorias base.
        let q = i.q, k = i.k;
        // Se o item escala...
        if (i.s) {
          // ...itens contados (un): arredonda para inteiro, mínimo 1, e recalcula as calorias;
          if (i.u === 'un') { q = Math.max(1, Math.round(i.q * fator)); k = i.k * q / i.q; }
          // ...itens em g/ml: arredonda para múltiplo de 5 e recalcula as calorias.
          else { q = round5(i.q * fator); k = i.k * q / i.q; }
        // Fim do if.
        }
        // Soma ao total da refeição.
        total += k;
        // Separa o texto "singular|plural" (ex.: "ovo|ovos").
        const [sg, pl] = (i.un || 'unidade|unidades').split('|');
        // Texto da quantidade: "1 ovo" / "2 ovos" ou "150 g".
        const qtxt = i.u === 'un' ? `${q} ${q === 1 ? sg : pl}` : `${q} ${i.u}`;
        // Devolve só nome e texto da quantidade.
        return { n: i.n, qtxt };
      // Fim do map dos itens.
      });
      // Devolve a refeição pronta: tipo, nome, horário, itens e calorias arredondadas.
      return { meal: e.meal, nome: def.nome, t: e.t, itens: out, kcal: Math.round(total) };
    // Fim do map das refeições.
    });
    // Devolve tudo: metas, refeições, removidos (em array), faltas, palavras e total do dia.
    return { K, refeicoes, removidos: [...removidos.entries()], faltas: [...faltas], termos, total: refeicoes.reduce((a, m) => a + m.kcal, 0) };
  // Fim da função montarDieta.
  }
  // Textos amigáveis para cada grupo que pode faltar.
  const FALTA_TXT = { prot: 'proteína no almoço e jantar', cafeProt: 'proteína no café', base: 'carboidrato nas refeições principais', veg: 'verduras e legumes', fruta: 'frutas', feijao: 'leguminosas', lancheProt: 'proteína nos lanches', lancheCarb: 'carboidrato nos lanches', cafeCarb: 'carboidrato no café' };
  // dietaHTML: gera o HTML da dieta; 'comTroca' decide se aparecem os botões "Trocar opção".
  function dietaHTML(P, comTroca = true) {
    // Objetivo salvo.
    const obj = U.respostas.dieta.obj;
    // Texto do objetivo em português.
    const objTxt = { perder: 'perder gordura', manter: 'manter o peso', ganhar: 'ganhar massa' }[obj];
    // HTML gerado nas linhas abaixo (comentário fora do texto para não aparecer na página):
    //   • abre a faixa de números (.diet-top);
    //   • caixa destacada com a meta diária em kcal;
    //   • caixa com o gasto estimado;
    //   • caixa com a proteína em gramas;
    //   • caixa com o objetivo;
    //   • fecha a faixa de números;
    //   • se o IMC está abaixo de 18,5, mostra o aviso de não perder peso;
    //   • se algo foi removido, lista os alimentos riscados (o motivo aparece ao passar o mouse, no title);
    //   • se a pessoa escreveu algo mas nada foi removido, avisa que nada bateu;
    //   • se algum grupo ficou sem opção, avisa e sugere nutricionista;
    //   • abre a lista de refeições e, para cada uma, um <article class="meal">;
    //   • horário da refeição (e a palavrinha "lanche" embaixo, se for lanche);
    //   • nome da refeição, lista dos alimentos com quantidade e calorias aproximadas;
    //   • botão "Trocar opção" (só se comTroca for true);
    //   • fecha o article e a lista de refeições;
    //   • total do dia e quantidade de água (35 a 40 ml por kg).
    return `<div class="diet-top">
        <div class="stat hl"><span>Meta diária</span><strong>${P.K.alvo.toLocaleString('pt-BR')} kcal</strong></div>
        <div class="stat"><span>Gasto estimado</span><strong>${P.K.get.toLocaleString('pt-BR')} kcal</strong></div>
        <div class="stat"><span>Proteína</span><strong>~${P.K.prot} g</strong></div>
        <div class="stat"><span>Objetivo</span><strong style="font-size:1.1rem">${objTxt}</strong></div>
      </div>
      ${P.K.avisoBaixo ? '<p class="note">Seu IMC está abaixo de 18,5. Perder peso não é recomendado agora; considere o objetivo "Manter" ou "Ganhar massa" e converse com um nutricionista.</p>' : ''}
      ${P.removidos.length ? `<div class="removed"><strong>Tiramos do cardápio:</strong> ${P.removidos.map(([n, m]) => `<span class="tag" title="${esc(m)}">${esc(n)}</span>`).join('')}</div>` : ''}
      ${P.termos.length && !P.removidos.length ? `<p class="muted">Nenhum alimento do cardápio bateu com "${esc(U.respostas.dieta.nao)}", então nada precisou sair.</p>` : ''}
      ${P.faltas.length ? `<p class="note">Com essas restrições, ficamos sem opções de ${P.faltas.map((f) => FALTA_TXT[f] || f).join(', ')}. Um nutricionista pode sugerir substitutos.</p>` : ''}
      <div class="meals">${P.refeicoes.map((m) => `<article class="meal">
        <time>${hhmm(m.t)}<small>${m.nome.split(' ')[0] === 'Lanche' ? 'lanche' : ''}</small></time>
        <div><h4>${m.nome}</h4><ul>${m.itens.map((i) => `<li><span>${esc(i.n)}</span><em>${i.qtxt}</em></li>`).join('')}</ul><p class="kcal">≈ ${m.kcal} kcal</p></div>
        ${comTroca ? `<button class="btn btn-line btn-sm" type="button" data-troca="${m.meal}">Trocar opção</button>` : ''}
      </article>`).join('')}</div>
      <p class="muted">Total do dia ≈ ${P.total.toLocaleString('pt-BR')} kcal. Beba de ${fmt1(U.peso * 0.035).replace(',0', '')} a ${fmt1(U.peso * 0.04).replace(',0', '')} litros de água por dia. Quantidades em peso de alimento pronto.</p>`;
  // Fim da função dietaHTML.
  }
  // renderDieta: desenha a etapa da dieta.
  function renderDieta() {
    // D = dieta salva (pode ser null).
    const D = U.respostas.dieta;
    // Se já existe dieta salva...
    if (D) {
      // ...marca o rádio do objetivo salvo;
      const o = $(`input[name="obj"][value="${D.obj}"]`); if (o) o.checked = true;
      // ...marca os checkboxes de restrição salvos;
      $$('input[name="restr"]').forEach((i) => { i.checked = (D.restr || []).includes(i.value); });
      // ...preenche o "não gosto";
      $('#d-nao').value = D.nao || '';
      // ...monta e mostra a dieta e o botão "Ver meu plano completo".
      $('#dieta-out').innerHTML = dietaHTML(montarDieta()); $('#dieta-fim').hidden = false;
    // Se ainda não existe dieta...
    } else {
      // ...calcula o IMC;
      const info = imcInfo(U.peso, U.altura);
      // ...sugere objetivo: ganhar (abaixo do peso), manter (adequado) ou perder (acima);
      const sug = info && info.v < 18.5 ? 'ganhar' : info && info.v < 25 ? 'manter' : 'perder';
      // ...marca o rádio sugerido;
      const o = $(`input[name="obj"][value="${sug}"]`); if (o) o.checked = true;
      // ...limpa a área da dieta e esconde o botão final.
      $('#dieta-out').innerHTML = ''; $('#dieta-fim').hidden = true;
    // Fim do if/else.
    }
  // Fim da função renderDieta.
  }

  // renderResumo: monta o painel final. Pega respostas, IMC e agenda.
  function renderResumo() {
    // Pega respostas, IMC e agenda do dia.
    const R = U.respostas; const info = imcInfo(U.peso, U.altura); const ag = agenda();
    // Monta a dieta se ela existir.
    const P = R.dieta ? montarDieta() : null;
    // Dicionário tipo de refeição -> refeição montada (para mostrar os alimentos na linha do tempo).
    const mealsBy = P ? Object.fromEntries(P.refeicoes.map((m) => [m.meal, m])) : {};
    // Título personalizado com o nome da pessoa.
    $('#resumo-title').textContent = `${U.nome}, seu dia no prumo`;
    // Lista de esportes em pares [id, dados].
    const sports = Object.entries(R.esportes);
    // Treino aplicado (só se não faz musculação e aceitou o treino).
    const T = (!fazMusculacao() && R.aplicarTreino) ? buildTreino() : null;
    // Objeto reservado para marcar dias de esporte na semana (não é usado no momento).
    const weekExtra = {};
    // Monta a linha do tempo do dia, um <li> por evento:
    const tl = ag.ev.map((e) => {
      // Se o evento é refeição...
      if (e.k === 'refeicao') {
        // ...pega a refeição montada e o nome dela;
        const m = mealsBy[e.meal]; const nome = MEALS[e.meal].nome;
        // ...gera o <li> com horário, bolinha, nome e os alimentos (ou o aviso para montar a dieta).
        return `<li class="k-refeicao"><time>${hhmm(e.t)}</time><span class="pt"></span><span class="t-txt"><strong>${nome}</strong><small>${m ? m.itens.map((i) => i.n).join(', ') : 'monte a dieta para ver o cardápio'}</small></span></li>`;
      // Fim do if.
      }
      // Outros eventos: <li> com horário, bolinha, título e detalhe (se houver).
      return `<li class="k-${e.k}"><time>${hhmm(e.t)}</time><span class="pt"></span><span class="t-txt"><strong>${esc(e.titulo)}</strong>${e.det ? `<small>${esc(e.det)}</small>` : ''}</span></li>`;
    // Junta tudo num texto só.
    }).join('');
    // n = respostas da etapa de novo esporte.
    const n = R.novo;
    // HTML gerado nas linhas abaixo (comentário fora do texto para não aparecer na página):
    //   • abre a grade .summary;
    //   • cartão do IMC: número grande e etiqueta da categoria;
    //   • peso, altura e faixa saudável; fecha o cartão;
    //   • cartão "Seu dia" com a linha do tempo (e etiqueta se treina no fim de semana);
    //   • cartão de esportes com a lista (vezes e minutos) ou aviso de que não pratica;
    //   • se escolheu regiões, mostra "Foco: ...";
    //   • botão "Editar esportes"; fecha o cartão;
    //   • se aplicou o treino, cartão com o treino completo...
    //   • ...senão (e não faz musculação), cartão dizendo que o treino continua pronto, com botão "Ver treino";
    //   • se há dieta, cartão da dieta sem os botões de troca;
    //   • se quis novo esporte e informou cidade, cartão de lugares;
    //   • fecha a grade;
    //   • abre a área de botões finais;
    //   • botão "Ajustar rotina";
    //   • botão "Refazer do começo";
    //   • fecha a área de botões.
    $('#resumo-out').innerHTML = `<div class="summary">
      <section class="card s-imc"><span class="muted">IMC</span><div class="big">${fmt1(info.v)}</div><span class="tag ${info.cls === 'ok' ? 'accent' : info.cls === 'warn' ? 'warn' : 'accent'}">${info.cat}</span>
        <p class="muted">${fmt1(U.peso)} kg · ${U.altura} cm · faixa saudável ${info.faixa}</p></section>
      <section class="card s-day"><div class="card-head"><h3>Seu dia</h3>${ag.fds ? '<span class="tag">Treinos no fim de semana</span>' : ''}</div><ol class="timeline">${tl}</ol></section>
      <section class="card s-sports"><h3>Esportes</h3>${sports.length ? `<ul class="sport-list">${sports.map(([id, e]) => `<li><span>${SPORT_BY[id].nome}</span><span class="muted">${e.vezes}× · ${e.min} min</span></li>`).join('')}</ul>` : '<p class="muted">Você ainda não pratica esportes.</p>'}
        ${R.foco.length ? `<p class="muted">Foco: ${R.foco.map((f) => FOCOS.find((x) => x.id === f).nome.toLowerCase()).join(', ')}</p>` : ''}
        <button class="btn btn-line btn-sm" type="button" data-step-go="esportes">Editar esportes</button></section>
      ${T ? `<section class="card s-full"><div class="card-head"><h3>Treino de academia aplicado</h3><span class="tag accent">${T.dias} dias por semana</span></div>${treinoHTML(T)}</section>`
        : (!fazMusculacao() ? `<section class="card s-full"><div class="card-head"><h3>Treino de academia</h3></div><p class="muted">Você preferiu não aplicar o treino agora. Ele continua pronto.</p><div><button class="btn btn-primary btn-sm" type="button" data-step-go="treino">Ver treino</button></div></section>` : '')}
      ${P ? `<section class="card s-full"><div class="card-head"><h3>Dieta</h3><button class="btn btn-line btn-sm" type="button" data-step-go="dieta">Mudar preferências</button></div>${dietaHTML(P, false)}</section>` : ''}
      ${n && n.quer && n.cidade ? `<section class="s-full">${placesHTML(n)}</section>` : ''}
    </div>
    <div class="resumo-actions">
      <button class="btn btn-line" type="button" data-step-go="rotina">Ajustar rotina</button>
      <button class="btn btn-line" type="button" id="btn-refazer">Refazer do começo</button>
    </div>`;
  // Fim da função renderResumo.
  }


  // Dicionário etapa -> função que desenha (usado pela função go).
  const RENDER = { esportes: renderEsportes, treino: renderTreino, foco: renderFoco, rotina: renderRotina, novo: renderNovo, dieta: renderDieta, resumo: renderResumo };

 
  // Escuta TODOS os cliques da página (técnica chamada "delegação de eventos").
  document.addEventListener('click', (e) => {
    // Sobe a partir do elemento clicado até achar um <button> ou <a>; se não achar, ignora o clique.
    const t = e.target.closest('button, a'); if (!t) return;
    // Botões com data-auth (abertura): escolhe a aba e vai para onde a pessoa parou, ou para a etapa de conta.
    if (t.dataset.auth) { setTab(t.dataset.auth); if (U) go(U.respostas.dieta ? 'resumo' : U.respostas.step || 'esportes'); else go('conta'); return; }
    // Botões com data-go="inicio" (logo): volta à abertura.
    if (t.dataset.go === 'inicio') { show('inicio'); return; }
    // Botões com data-step-go: vai direto para aquela etapa.
    if (t.dataset.stepGo) { go(t.dataset.stepGo); return; }
    // Botões com data-back: volta uma etapa.
    if (t.hasAttribute('data-back')) { back(); return; }
    // Botões "Trocar opção": soma 1 no contador da refeição, salva, redesenha a dieta, avisa e devolve o foco ao botão.
    if (t.dataset.troca) { const R = U.respostas; R.reroll[t.dataset.troca] = (R.reroll[t.dataset.troca] || 0) + 1; save(); $('#dieta-out').innerHTML = dietaHTML(montarDieta()); toast('Opção trocada'); const b = $(`[data-troca="${t.dataset.troca}"]`); if (b) b.focus(); return; }
    // Para os demais, decide pelo id do botão:
    switch (t.id) {
      // "Entrar" do topo: abre a aba de login.
      case 'btn-topo-entrar': setTab('entrar'); go('conta'); break;
      // "Sair": desloga.
      case 'btn-sair': sair(); break;
      // Aba "Criar conta".
      case 'tab-criar': setTab('criar'); break;
      // Aba "Entrar".
      case 'tab-entrar': setTab('entrar'); break;
      // Botão "Continuar" dos esportes:
      case 'btn-esportes': {
        // atalho para as respostas;
        const R = U.respostas;
        // se não marcou nada, mostra erro e para;
        if (!R.nenhum && !Object.keys(R.esportes).length) { $('#esportes-erro').textContent = 'Marque pelo menos um esporte, ou "Não faço esporte".'; return; }
        // se faz musculação pula o treino pronto e vai para foco; senão vai para treino.
        go(fazMusculacao() ? 'foco' : 'treino'); break;
      // Fim do case.
      }
      // "Sim, aplica": marca o treino como aplicado, salva, avisa e vai para foco.
      case 'treino-sim': U.respostas.aplicarTreino = true; save(); toast('Treino aplicado na sua rotina'); go('foco'); break;
      // "Agora não": marca como não aplicado e vai para foco.
      case 'treino-nao': U.respostas.aplicarTreino = false; save(); go('foco'); break;
      // "Pular" região: limpa as regiões e vai para rotina.
      case 'foco-pular': U.respostas.foco = []; save(); go('rotina'); break;
      // "Continuar" da região: vai para rotina.
      case 'btn-foco': go('rotina'); break;
      // "Continuar" do novo esporte:
      case 'btn-novo': {
        // atalho para as respostas;
        const R = U.respostas;
        // se disse que quer mas não buscou cidade e bairro, mostra erro e para;
        if (R.novo && R.novo.quer && !(R.novo.cidade && R.novo.bairro)) { $('#novo-erro').textContent = 'Preencha cidade e bairro e toque em "Buscar lugares perto", ou marque "Não por enquanto".'; return; }
        // senão vai para a dieta.
        go('dieta'); break;
      // Fim do case.
      }
      // "Ver meu plano completo": vai para o resumo.
      case 'btn-dieta': go('resumo'); break;
      // "Copiar mensagem":
      case 'copiar-msg': {
        // pega o texto da mensagem;
        const txt = $('#msg-box').textContent;
        // função de sucesso: avisa que copiou;
        const ok = () => toast('Mensagem copiada');
        // plano B: seleciona o texto na tela e pede para a pessoa usar Ctrl+C;
        const fallback = () => { const r = document.createRange(); r.selectNodeContents($('#msg-box')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Texto selecionado: copie com Ctrl+C'); };
        // tenta copiar com a área de transferência do navegador; se falhar, usa o plano B;
        try { navigator.clipboard.writeText(txt).then(ok, fallback); } catch (err) { fallback(); }
        // sai do switch.
        break;
      // Fim do case.
      }
      // "Refazer do começo": zera as respostas, mantém a conta e volta para esportes.
      case 'btn-refazer': U.respostas = blank(); U.respostas.reached = ['conta', 'esportes']; save(); go('esportes'); break;
    // Fim do switch.
    }
  // Fim do ouvinte de cliques.
  });

  // A cada tecla em peso ou altura do cadastro, recalcula o IMC ao vivo.
  ['#c-peso', '#c-altura'].forEach((s) => $(s).addEventListener('input', paintImcLive));
  // Envio do formulário de cadastro chama onCriar.
  $('#form-criar').addEventListener('submit', onCriar);
  // Envio do formulário de login chama onEntrar.
  $('#form-entrar').addEventListener('submit', onEntrar);
  // Mudança nos chips de esportes chama onSportChange.
  $('#sport-chips').addEventListener('change', onSportChange);
  // Mudança nos selects de frequência chama onFreqChange.
  $('#freq-list').addEventListener('change', onFreqChange);
  // Mudança nos dias de treino: salva o número e redesenha o treino.
  $('#treino-dias').addEventListener('change', (e) => { U.respostas.treinoDias = +e.target.value; save(); renderTreino(); });
  // Mudança nos chips de região:
  $('#foco-chips').addEventListener('change', (e) => {
    // pega as respostas e o valor do chip;
    const R = U.respostas; const v = e.target.value;
    // se marcou, adiciona sem repetir (Set); se desmarcou, remove; depois salva.
    R.foco = e.target.checked ? [...new Set(R.foco.concat(v))] : R.foco.filter((f) => f !== v); save();
  // Fim do ouvinte.
  });
  // Ao digitar na rotina, atualiza o texto do sono.
  $('#form-rotina').addEventListener('input', paintSono);
  // Ao mudar um campo da rotina (rádios, select), também atualiza.
  $('#form-rotina').addEventListener('change', paintSono);
  // Ao enviar a rotina:
  $('#form-rotina').addEventListener('submit', (e) => {
    // impede recarregar, guarda a rotina, salva e vai para novo esporte.
    e.preventDefault(); U.respostas.rotina = readRotina(); save(); go('novo');
  // Fim do ouvinte.
  });
  // Ao escolher Sim/Não no novo esporte:
  $('#novo-quer').addEventListener('change', (e) => {
    // quer = true se escolheu "sim";
    const quer = e.target.value === 'sim';
    // guarda a escolha mantendo os outros dados (Object.assign) e salva;
    U.respostas.novo = Object.assign(U.respostas.novo || {}, { quer }); save();
    // mostra/esconde o formulário e limpa o erro;
    $('#form-novo').hidden = !quer; $('#novo-erro').textContent = '';
    // se quer, coloca o cursor no campo cidade.
    if (quer) $('#n-cidade').focus();
  // Fim do ouvinte.
  });
  // Ao enviar a busca de lugares:
  $('#form-novo').addEventListener('submit', (e) => {
    // impede recarregar;
    e.preventDefault();
    // monta o objeto com esporte, cidade e bairro;
    const n = { quer: true, esporte: $('#n-esporte').value, cidade: $('#n-cidade').value.trim(), bairro: $('#n-bairro').value.trim() };
    // se faltar cidade ou bairro, mostra erro e para;
    if (!n.cidade || !n.bairro) { $('#novo-erro').textContent = 'Preencha a cidade e o bairro para buscar.'; return; }
    // limpa o erro;
    $('#novo-erro').textContent = '';
    // salva os dados;
    U.respostas.novo = n; save();
    // mostra o cartão de lugares.
    $('#novo-out').innerHTML = placesHTML(n);
  // Fim do ouvinte.
  });
  // Ao enviar o formulário da dieta:
  $('#form-dieta').addEventListener('submit', (e) => {
    // impede recarregar;
    e.preventDefault();
    // atalho para as respostas;
    const R = U.respostas;
    // guarda objetivo, lista de restrições marcadas e o texto de "não gosto";
    R.dieta = { obj: ($('input[name="obj"]:checked') || {}).value || 'perder', restr: $$('input[name="restr"]:checked').map((i) => i.value), nao: $('#d-nao').value.trim() };
    // zera as trocas de opção (cardápio novo);
    R.reroll = {};
    // salva, mostra a dieta e o botão final;
    save(); $('#dieta-out').innerHTML = dietaHTML(montarDieta()); $('#dieta-fim').hidden = false;
    // rola a tela suavemente até a dieta.
    $('#dieta-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Fim do ouvinte.
  });

  
  /* ================= filtro das fotos de antes e depois ================= */
  // Nome de cada grupo para o texto de contagem.
  const NOME_FILTRO = { todos: 'exemplos', mulher: 'exemplos de mulheres', velho: 'exemplos de pessoas mais velhas', jovem: 'exemplos de jovens' };
  // Clique num botão do filtro:
  $('.filtro').addEventListener('click', (e) => {
    // pega o botão clicado (ou sai, se clicou no espaço entre eles);
    const b = e.target.closest('.filtro-btn'); if (!b) return;
    // qual grupo foi pedido ("todos", "mulher", "velho" ou "jovem");
    const f = b.dataset.filtro;
    // liga só o botão clicado;
    $$('.filtro-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    // conta quantas fotos ficam visíveis;
    let n = 0;
    // para cada foto: mostra se for do grupo (ou se for "todos") e esconde as outras;
    $$('#examples .example').forEach((fig) => {
      // true se a foto deve aparecer.
      const mostra = f === 'todos' || fig.dataset.cat === f;
      // A classe "escondido" some com a foto.
      fig.classList.toggle('escondido', !mostra);
      // Reinicia a animação de entrada: tira a classe, força o navegador a recalcular (offsetWidth) e põe de volta.
      fig.classList.remove('entrando'); if (mostra) { void fig.offsetWidth; fig.classList.add('entrando'); n++; }
    // Fim do forEach.
    });
    // Escreve "4 exemplos de mulheres" (ou "1 exemplo...", no singular).
    $('#filtro-conta').textContent = `${n} ${n === 1 ? NOME_FILTRO[f].replace('exemplos', 'exemplo') : NOME_FILTRO[f]}`;
  // Fim do ouvinte.
  });

  /* ================= aparência: tema e modo daltônico ================= */
  // Chaves onde a escolha de aparência fica salva (as mesmas lidas pelo <script> do <head>).
  const KEY_TEMA = 'prumo:tema', KEY_CVD = 'prumo:daltonico';
  // Consulta do sistema: .matches fica true quando o aparelho está no modo escuro.
  const escuroSistema = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  // Atalhos para o botão e o painel de aparência.
  const btnAp = $('#btn-aparencia'), popAp = $('#painel-aparencia');
  // Nome de cada modo de daltonismo (usado nos avisos e no leitor de tela).
  const NOME_CVD = { off: 'desligado', protan: 'protanopia', deutan: 'deuteranopia', tritan: 'tritanopia', acro: 'acromatopsia' };
  // aplicarTema: lê as escolhas salvas, marca o <html> e deixa o painel mostrando as opções certas.
  function aplicarTema() {
    // Tema salvo ("claro", "escuro" ou "auto") e o modo de daltonismo salvo (padrão "off").
    const tema = store.get(KEY_TEMA, 'auto'); let cvd = store.get(KEY_CVD, 'off');
    // Quem salvou na versão antiga (true/false) vira "deutan"/"off"; valor desconhecido vira "off".
    if (cvd === true) cvd = 'deutan'; if (!NOME_CVD[cvd]) cvd = 'off';
    // Decide se fica escuro: escolha "escuro", ou "auto" com o aparelho no modo escuro.
    const escuro = tema === 'escuro' || (tema === 'auto' && !!escuroSistema && escuroSistema.matches);
    // data-theme no <html> troca todas as cores pelo CSS.
    document.documentElement.dataset.theme = escuro ? 'dark' : 'light';
    // data-cvd="protan" (ou outro modo) liga a paleta daquele daltonismo; "off" remove o atributo.
    if (cvd !== 'off') document.documentElement.dataset.cvd = cvd; else delete document.documentElement.dataset.cvd;
    // Marca no painel o rádio do tema salvo.
    const r = $(`input[name="tema"][value="${tema}"]`); if (r) r.checked = true;
    // Marca no painel a opção de daltonismo salva.
    const m = $(`input[name="cvd"][value="${cvd}"]`); if (m) m.checked = true;
    // Atualiza o nome do botão lido pelo leitor de tela.
    btnAp.setAttribute('aria-label', `Aparência: tema ${escuro ? 'escuro' : 'claro'}${cvd !== 'off' ? ', modo ' + NOME_CVD[cvd] : ''}`);
  // Fim da função aplicarTema.
  }
  // abrirAparencia(true/false): mostra ou esconde o painel e avisa o leitor de tela.
  function abrirAparencia(abrir) {
    // Mostra/esconde o painel.
    popAp.hidden = !abrir;
    // Atualiza aria-expanded do botão.
    btnAp.setAttribute('aria-expanded', String(abrir));
    // Ao abrir, coloca o foco do teclado na opção de tema marcada.
    if (abrir) { const r = popAp.querySelector('input:checked'); if (r) r.focus(); }
  // Fim da função abrirAparencia.
  }
  // Clique no botão: abre se estiver fechado, fecha se estiver aberto.
  btnAp.addEventListener('click', () => abrirAparencia(popAp.hidden));
  // Clique em qualquer lugar fora da caixa de aparência fecha o painel.
  document.addEventListener('click', (e) => { if (!popAp.hidden && !e.target.closest('.a11y')) abrirAparencia(false); });
  // Tecla Esc fecha o painel e devolve o foco ao botão.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !popAp.hidden) { abrirAparencia(false); btnAp.focus(); } });
  // Mudança de opção dentro do painel:
  popAp.addEventListener('change', (e) => {
    // se mudou o tema, salva e avisa;
    if (e.target.name === 'tema') { store.set(KEY_TEMA, e.target.value); toast({ claro: 'Tema claro ligado', escuro: 'Tema escuro ligado', auto: 'Tema automático: segue o aparelho' }[e.target.value]); }
    // se escolheu um modo de daltonismo, salva e avisa;
    if (e.target.name === 'cvd') { store.set(KEY_CVD, e.target.value); toast(e.target.value === 'off' ? 'Modo de daltonismo desligado' : `Modo ${NOME_CVD[e.target.value]} ligado`); }
    // e aplica na hora.
    aplicarTema();
  // Fim do ouvinte.
  });
  // Se o aparelho trocar entre claro e escuro e o tema for "auto", acompanha.
  if (escuroSistema && escuroSistema.addEventListener) escuroSistema.addEventListener('change', () => { if (store.get(KEY_TEMA, 'auto') === 'auto') aplicarTema(); });
  // Aplica a aparência salva assim que o código roda.
  aplicarTema();

  // Ao abrir a página: ajusta o topo e o IMC do cadastro.
  paintTop(); paintImcLive();
  // Se já havia alguém logado, mostra o IMC dele na barra.
  if (U) { paintRail(); }
  // Começa sempre pela tela de abertura.
  show('inicio');
// Fecha a função que se executa sozinha e já a executa com ().
})();