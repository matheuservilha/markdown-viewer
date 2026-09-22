# Notas fixadas na borda da tela

Uma faixa fina fica colada na borda do monitor, por cima de todos os outros
apps. Cada traço colorido é uma nota. O mouse encosta, a faixa abre na lista
inteira; o mouse para em cima de uma linha, a nota sai voando ao lado; um
clique prende a nota e ela vira um editor de verdade.

## Como uma nota chega lá

São dois caminhos, e nenhum dos dois acontece sem querer.

**Fixando um arquivo que já existe.** O alfinete na barra de cima do app fixa
o arquivo aberto, e `⌘⇧P` faz o mesmo. Na árvore de arquivos, o botão direito
também oferece. Um segundo clique desafixa.

**Escrevendo direto na barra.** O `+` no topo da lista abre uma nota nova na
hora, sem diálogo e sem arquivo nenhum no disco. Ela é um rascunho, igual ao que
o `⌘N` já abria: aparece também como aba não salva na janela principal, e o
`⌘S` de lá é que pergunta onde gravar. O nome dela é a primeira linha do que
você escreveu, na aba e na barra ao mesmo tempo.

Fechar essa aba joga o texto fora, então ela sai da barra junto. Arquivo é
outra coisa: fechar a aba de um arquivo não desafixa nada, porque o arquivo
continua no disco.

## Os três estados

**Em repouso** a faixa tem treze pixels, um traço por nota, com a cor de cada
uma. É o bastante para saber quantas notas existem e qual é qual, e é pouco o
bastante para você esquecer que ela está lá. Uma nota com texto não salvo tem
o traço mais comprido.

**Aberta** a lista mostra os nomes. O `…` de cada linha abre as ações dentro da
própria linha: a cor, subir, descer, abrir no app e desafixar. As ações abrem
dentro e não por cima porque uma janela dessa largura não tem onde botar um
menu flutuante: o que for desenhado fora dela é cortado pelo sistema.

**Flutuando** é a nota em si, colada na barra. Parar o mouse em cima de uma
linha só mostra o texto; o clique é que prende a janela e libera a escrita.
Presa, ela tem o mesmo editor do app: rolagem, caixinha de tarefa, tabela,
negrito, tudo. `Esc` fecha.

A barra e a nota ficam abertas enquanto o mouse estiver em cima de qualquer uma
das duas, e fecham cerca de 300 ms depois de ele sair das duas. Quem decide
isso é a janela principal, perguntando ao sistema onde o ponteiro está umas dez
vezes por segundo. Perguntar aos painéis não funciona: janela que está sempre
por cima e nunca foi clicada não é a janela ativa, e não recebe do sistema o
aviso de que o ponteiro saiu. Foi o que deixou a lista aberta na tela vazia na
primeira versão.

## Sobre salvar

A nota flutuante grava sozinha depois de uma pausa na digitação, **mesmo com
"Salvar sozinho" desligado nos ajustes**. Aqui não existe aba, nem pergunta na
hora de fechar: a janela some com um clique em qualquer outro lugar, e o texto
dentro dela seria a única cópia. Um painel que esquece é pior que um painel que
salva.

Se o arquivo mudou por fora enquanto você escrevia, ela não sobrescreve. Aparece
uma tarja com "Recarregar" e "Salvar mesmo assim", e a decisão é sua.

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

São três janelas do mesmo app: a janela principal, a barra e a nota flutuante.
A barra e a nota não são um segundo programa, são este aqui com outro rótulo de
janela, que é o que faz o editor da nota flutuante ser o mesmo editor do app,
tema e teclado inclusive.

A janela principal é dona de tudo. Ela guarda a lista, a ordem e as cores, e é
a única que escreve qualquer coisa. As outras duas informam o que o mouse fez e
desenham o que mandarem: duas janelas com uma cópia da mesma lista cada uma,
trocando recados, é o defeito que esse arranjo não tem.

Onde cada painel vai parar na tela é conta, e a conta mora em
`src/app/dock-layout.ts`, longe do sistema de janelas, para poder ser conferida
sem uma tela por perto.
