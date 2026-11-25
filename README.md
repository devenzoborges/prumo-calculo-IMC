# Prumo

Site que monta um plano de saúde a partir do seu dia: calcula o IMC, sugere um treino, encaixa tudo nos seus horários e fecha com uma dieta sem o que você não gosta.

Feito só com **HTML, CSS e JavaScript**, sem biblioteca e sem servidor. Os dados ficam salvos no próprio navegador.

## Como abrir

Dê dois cliques no `index.html`. Não precisa instalar nada.

## Arquivos

```
atv9/
├── index.html   estrutura: telas, formulários e etapas
├── style.css    aparência: cores, fontes, temas e versão celular
├── app.js       comportamento: cálculos, navegação e dados
└── img/         fotos de antes e depois da página inicial
```

## Como o site foi construído

1. **Ideia e nome.** O prumo é o fio com peso que mostra se uma parede está reta. A ideia é deixar a rotina "no prumo", e isso guiou as cores e o logo.
2. **Estrutura em HTML.** Primeiro a página inicial, depois uma `<section>` para cada etapa: conta, esportes, treino, região, rotina, novo esporte, dieta e resumo. Só uma etapa aparece por vez.
3. **Paleta e fontes.** Areia como fundo, verde nos botões e manteiga e terracota nos destaques (regra 60-30-10). As cores ficam em variáveis no topo do `style.css`, como `--green` e `--sand`, e mudar ali muda o site todo.
4. **Layout responsivo.** Grid e flexbox. Em telas menores, a barra lateral vira uma faixa no topo e as colunas viram uma só.
5. **Cadastro e IMC.** O `app.js` calcula o IMC enquanto a pessoa digita e move o marcador na régua colorida. A senha é salva como hash (SHA-256), nunca em texto.
6. **Navegação por etapas.** As funções `go()`, `next()` e `back()` trocam de etapa, e `paintSteps()` desenha o "fio de prumo" na lateral, com ✓ nas etapas feitas e o losango na atual.
7. **Treino, rotina e dieta.** Listas de exercícios e alimentos ficam no começo do `app.js`. A partir das respostas, o site monta o treino, os horários do dia e um cardápio que tira os alimentos que a pessoa escreveu.
8. **Salvar os dados.** Tudo vai para o `localStorage`, e quem volta ao site continua de onde parou.
9. **Página inicial interativa.** Os passos de "Como o plano é montado" reagem ao mouse: uma barrinha cresce embaixo e o número sobe. Nos exemplos de antes e depois, botões filtram as fotos por Geral, Mulheres, Mais velhos e Jovens. Cada foto tem um `data-cat`, e o JavaScript mostra só as do grupo escolhido.
10. **Acessibilidade.** Foco visível no teclado, textos alternativos nas fotos, `aria-live` para anunciar o IMC e contraste conferido pela WCAG.
11. **Temas e modo daltônico.** O botão de sol/lua no topo troca entre claro, escuro e automático. O modo daltônico troca verde e vermelho por azul e laranja e acrescenta ✓, ! e listras para não depender só da cor.
12. **Comentários.** Cada linha do código tem um comentário explicando o que faz.

## Aviso

O Prumo dá uma orientação geral e não substitui médico, nutricionista ou educador físico. As fotos de antes e depois são ilustrativas.
