# Notas fixadas na borda da tela

Uma coluna de quadradinhos coloridos fica colada na borda do monitor, por cima
de todos os outros apps, um quadradinho por nota. Não tem painel nem moldura:
a janela é transparente, e entre um quadradinho e outro aparece o que estiver
atrás. O mouse para em cima de um, a nota sai ao lado para você ler. Tira o
mouse, some.

## Como uma nota chega lá

São dois caminhos, e nenhum dos dois acontece sem querer.

**Fixando um arquivo que já existe.** O alfinete na barra de cima do app fixa
o arquivo aberto, e `⌘⇧P` faz o mesmo. Na árvore de arquivos, o botão direito
também oferece. Um segundo clique desafixa. Desafixar é sempre no app: o
quadradinho não tem menu, porque 26 pixels não têm onde pôr um.

**Clicando no `+`.** O quadradinho de baixo abre uma nota nova na hora, sem
diálogo e sem arquivo nenhum no disco. Ela é um rascunho, igual ao que o `⌘N`
já abria: aparece também como aba não salva na janela principal, e o `⌘S` de lá
é que pergunta onde gravar. O nome dela é a primeira linha do que você
escreveu, na aba e no quadradinho ao mesmo tempo.

Fechar essa aba joga o texto fora, então o quadradinho vai junto. Arquivo é
outra coisa: fechar a aba de um arquivo não desafixa nada, porque o arquivo
continua no disco.

## O que acontece quando o mouse passa

Parar em cima de um quadradinho abre a nota dele ao lado, para ler. Ela não
fixa, não pede nada e não pega o teclado: é uma olhada. Tirar o mouse do
quadradinho fecha, e **tirar para cima da própria nota fecha igual**. Se você
quer escrever nela, clique no quadradinho e ela abre no app.

O quadradinho de baixo, o do `+`, veste a cor que a próxima nota vai ter.
Clicar nele escreve um rascunho novo, que vira mais um quadradinho na coluna e
uma aba não salva na janela principal.

Quem fecha a nota é a janela principal, perguntando ao sistema onde o ponteiro
está umas dezesseis vezes por segundo. Perguntar aos painéis não funciona:
janela que fica sempre por cima e nunca foi clicada não é a janela ativa, e não
recebe do sistema o aviso de que o ponteiro saiu.

## Fechar o app não fecha as notas

Fechar a janela do app agora guarda ela, não encerra o programa. As notas
continuam na borda, por cima de tudo, que é o ponto: um lembrete grudado no
monitor não depende da gaveta estar aberta.

O ícone ao lado do relógio, na bandeja do sistema, é o que traz o app de volta
e o que encerra tudo de verdade. Ele tem três itens: abrir o app, escrever uma
nota e sair. `⌘Q` continua encerrando.

No Windows e no Linux, o botão esquerdo no ícone abre o app e o direito abre o
menu. No macOS os dois abrem o menu, e clicar no ícone do Dock também traz a
janela de volta.

## Ajustes

Em **Ajustes › Notas fixadas**:

| Ajuste           | O que faz                             |
| ---------------- | ------------------------------------- |
| Barra na borda   | liga e desliga a faixa. `⌘⇧D` também  |
| Lado             | esquerda ou direita                   |
| Encolher sozinha | desligado, a lista fica sempre aberta |

A barra abre em qualquer monitor que o app estiver, e acompanha você entre as
áreas de trabalho.

## Onde as coisas ficam

A lista de notas fixadas guarda só o endereço de cada uma: qual arquivo, em que
pasta, de que cor e em que ordem. O texto continua sendo o arquivo em disco, e
nada é copiado para lugar nenhum. Os rascunhos escritos na barra
moram no armazenamento do próprio app, na sua máquina, no mesmo lugar em que os
rascunhos das abas já moravam.

## Como isso funciona por dentro

São três janelas do mesmo app: a janela principal, a coluna de quadradinhos e a
nota que flutua. As duas últimas não são um segundo programa, são este aqui com
outro rótulo de janela, que é o que faz a nota ser desenhada pelo mesmo editor
do app, tema incluso.

As duas são transparentes e têm exatamente o tamanho do que desenham. Isso é
regra e não enfeite: janela transparente continua sendo janela, e todo pedaço
dela que a pessoa não vê é um pedaço de tela que engole clique calado. A coluna
tem 40px de largura e a altura exata dos quadradinhos.

No macOS, janela sem fundo depende do `macOSPrivateApi`, ligado no
`tauri.conf.json` e no `Cargo.toml`. É o que impediria este app de ser vendido
na App Store, e ele não é. No Linux depende de ter compositor, que qualquer
ambiente atual tem.

A janela principal é dona de tudo. Ela guarda a lista, a ordem e as cores, e é
a única que escreve qualquer coisa. As outras duas informam o que o mouse fez e
desenham o que mandarem: duas janelas com uma cópia da mesma lista cada uma,
trocando recados, é o defeito que esse arranjo não tem.

Onde cada quadradinho e cada nota vão parar na tela é conta, e a conta mora em
`src/app/dock-layout.ts`, longe do sistema de janelas, com 21 testes que rodam
sem uma tela por perto.
