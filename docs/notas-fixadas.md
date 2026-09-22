# Notas fixadas na borda da tela

Uma coluna de abinhas coloridas fica colada na borda do monitor, por cima de
todos os outros apps, uma por nota. Cada uma é um retângulo arredondado cortado
ao meio pela borda da tela: aparece a metade de dentro, redonda do lado de
dentro e reta do lado de fora, porque do lado de fora quem desenha é o monitor.
Elas nunca descolam da borda. O mouse chega e a abinha cresce para dentro, para
recebê-lo, e a nota sai ao lado para você ler. Tira o mouse, some.

Não tem painel nem moldura: a janela é transparente e entre uma abinha e outra
aparece o que estiver atrás.

## Como uma nota chega lá

São dois caminhos, e nenhum dos dois acontece sem querer.

**Fixando um arquivo que já existe.** O alfinete na barra de cima do app fixa
o arquivo aberto, e `⌘⇧P` faz o mesmo. Na árvore de arquivos, o botão direito
também oferece. Um segundo clique desafixa. Desafixar é sempre no app: a
abinha não tem menu, porque dezesseis pixels não têm onde pôr um.

**Clicando no `+`.** O quadradinho de baixo abre uma nota nova na hora, sem
diálogo e sem arquivo nenhum no disco. Ela é um rascunho, igual ao que o `⌘N`
já abria: aparece também como aba não salva na janela principal, e o `⌘S` de lá
é que pergunta onde gravar. O nome dela é a primeira linha do que você
escreveu, na aba e no quadradinho ao mesmo tempo.

Fechar essa aba joga o texto fora, então a abinha vai junto. Arquivo é
outra coisa: fechar a aba de um arquivo não desafixa nada, porque o arquivo
continua no disco.

## O que acontece quando o mouse passa

Parar em cima de uma abinha abre a nota dela ao lado, para ler. Ela não fixa,
não pede nada e não pega o teclado: é uma olhada. Tirar o mouse da abinha
fecha, e **tirar para cima da própria nota fecha igual**.

**Clicar na abinha guarda a nota.** Ela sai um passo para dentro, vira uma
janela sua e não sai mais: não fecha quando o mouse vai embora, não fecha
quando você clica em outro programa. Arrasta pela barra de cima, redimensiona
pelo canto, e fecha no `×` ou no `Esc`. Enquanto ela está lá, passar o mouse
nas outras abinhas continua abrindo as olhadas normalmente.

Dentro da nota guardada dá para escrever. Ela grava sozinha depois de uma pausa
na digitação, **mesmo com "Salvar sozinho" desligado nos ajustes**: aqui não
existe aba nem pergunta na hora de fechar, e o texto seria a única cópia. Se o
arquivo mudou por fora enquanto você escrevia, ela não sobrescreve: aparece uma
tarja com "Recarregar" e "Salvar mesmo assim".

A abinha de baixo, a do `+`, é vazada e veste a cor que a próxima nota vai ter.
Clicar nela escreve um rascunho novo, que vira mais uma abinha na coluna e uma
aba não salva na janela principal.

## Por que o ponteiro é vigiado do lado do Rust

As abinhas não descobrem sozinhas que o mouse chegou. No macOS, uma janela só
recebe evento de mouse se movendo enquanto o app dela é o app ativo, e esta
fica por cima do trabalho dos outros justamente para nunca precisar ser. O
primeiro clique em qualquer outro programa acabaria com o hover para sempre.

Então quem vigia é uma linha de execução do lado do Rust, em
`src-tauri/src/pointer.rs`. Ela pergunta ao sistema onde o ponteiro está a cada
45 ms, decide sobre qual abinha ele está, e avisa só quando a resposta muda. A
janela principal recebe esse aviso, acende a abinha e abre a nota. As abinhas
não adivinham nada: elas são informadas.

A mãozinha do cursor vem do mesmo lugar, e pelo mesmo motivo. O jeito normal,
que é a janela dizer qual cursor ela quer, passa pelas áreas de cursor do app
dono da janela, e o sistema só consulta as do app ativo. No Windows e no Linux
o CSS resolve; no macOS o cursor é trocado direto, na mesma linha de execução
que vigia o ponteiro.

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

São quatro janelas do mesmo app: a janela principal, a coluna de abinhas, a
olhada que vai e vem com o mouse e a nota guardada. As duas últimas não são um segundo programa, são este aqui com
outro rótulo de janela, que é o que faz a nota ser desenhada pelo mesmo editor
do app, tema incluso.

As duas são transparentes e têm exatamente o tamanho do que desenham. Isso é
regra e não enfeite: janela transparente continua sendo janela, e todo pedaço
dela que a pessoa não vê é um pedaço de tela que engole clique calado. A coluna
tem 30px de largura, que é o tamanho de uma abinha aberta, e a altura exata das
abinhas que estão nela.

A nota guardada é a exceção que confirma a regra: ela é uma janela que a pessoa
move e redimensiona, então o tamanho dela é o que ela escolheu, e cada pixel
dela é visível.

No macOS, janela sem fundo depende do `macOSPrivateApi`, ligado no
`tauri.conf.json` e no `Cargo.toml`. É o que impediria este app de ser vendido
na App Store, e ele não é. No Linux depende de ter compositor, que qualquer
ambiente atual tem.

A janela principal é dona de tudo. Ela guarda a lista, a ordem e as cores, e é
a única que escreve qualquer coisa. As outras duas informam o que o mouse fez e
desenham o que mandarem: duas janelas com uma cópia da mesma lista cada uma,
trocando recados, é o defeito que esse arranjo não tem.

Onde cada abinha e cada nota vão parar na tela é conta, e a conta mora em
`src/app/dock-layout.ts`, longe do sistema de janelas, com 22 testes que rodam
sem uma tela por perto.
