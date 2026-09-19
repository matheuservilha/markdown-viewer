# Funcionalidades

Editor e visualizador de Markdown com a experiência de escrita do Bear, funcionando sobre
uma pasta de arquivos do próprio usuário. Sem conta, sem servidor, sem sincronização.

As decisões da entrevista de 2026-09-19 estão na seção 9.

Data: 2026-09-19.

---

## 1. Em uma frase

Um app que abre uma pasta, mostra a árvore de arquivos ao lado, e edita `.md` e `.txt` com
a sintaxe do Markdown escondida até o cursor entrar nela.

## 2. O que está dentro e o que está fora

Dentro:

- abrir uma pasta como base e navegar por ela;
- abrir arquivo solto de qualquer lugar do disco, fora da base;
- ler e editar `.md`, `.markdown` e `.txt`;
- escrita seamless, ou seja, a marcação some quando o cursor sai e reaparece quando entra;
- interface bonita o bastante para a pessoa querer escrever nela.

Fora, por decisão:

- sincronização, conta de usuário, nuvem, colaboração em tempo real;
- criptografia de nota e bloqueio do app;
- web clipper, extensão de navegador, integração com assistente de voz;
- importadores de Evernote, Notion e afins, porque o arquivo já é o formato;
- banco de dados proprietário, porque a verdade é o arquivo em disco.

## 3. Plataformas

| Plataforma | Prioridade proposta | O que pesa nessa posição |
|---|---|---|
| macOS | 1 | é a plataforma de referência do visual |
| Windows | 2 | mesma base de código do macOS |
| Web | 3 | o acesso à pasta depende de API que hoje só o Chromium tem |
| iOS e iPadOS | 4 | teclado de estilo e toque mudam o editor |
| Android | 5 | teclado de estilo e toque mudam o editor |

O alvo é uma base de código só, com uma camada fina de sistema de arquivos por plataforma.
A proposta técnica está na seção 8.

---

## 4. Levantamento do Bear, item por item

Fonte: as páginas `bear.app` e `bear.app/faq`, consultadas em 2026-09-19.

Cada linha é uma funcionalidade que o Bear tem hoje. A segunda coluna registra a decisão
tomada na entrevista, em três estados. `Entra` é compromisso da primeira versão. `Depois` é
reconhecido e adiado. `Fora` é decisão de não fazer.

### 4.1 Editor e formatação

| Funcionalidade do Bear | Decisão |
|---|---|
| Markdown seamless, sintaxe escondida | Entra. É o que define o produto |
| Títulos de 1 a 6, com estilo próprio por nível | Entra |
| Negrito, itálico, sublinhado, tachado, marca-texto, código inline | Entra |
| Estilos combinados, como negrito dentro de marca-texto | Entra |
| Bloco de código com realce por linguagem | Entra |
| Citação | Entra |
| Lista com marcador e lista numerada | Entra |
| Tarefa `- [ ]`, marcar e desmarcar por atalho | Entra |
| Separador horizontal | Entra |
| Tabela, com criar, inserir e apagar linha e coluna | Entra |
| Nota de rodapé | Entra |
| Callout `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` | Entra. A sintaxe é a mesma do GitHub |
| Fórmula matemática, inline e em bloco | Depois. Fora da primeira versão |
| Diagrama Mermaid | Depois. Fora da primeira versão |
| Link comum `[texto](url)` | Entra |
| Wiki link `[[arquivo]]` com autocompletar | Entra. Resolve para arquivo da base |
| Prévia rica de link, com título e imagem | Fora. Exige rede, e o app é offline |
| Prévia de PDF dentro da nota | Depois |
| Imagem local, com redimensionar | Entra. Caminho relativo e absoluto |
| GIF animado | Entra |
| Desenho à mão com Apple Pencil | Fora |
| Escanear documento pela câmera | Fora |
| Seletor de emoji | Depois |
| YAML front matter | Entra. Como bloco de propriedades, não como texto solto |
| Dobrar título e lista | Entra |
| Mover linha para cima e para baixo, indentar e desindentar | Entra |
| Inserir data e hora por atalho | Depois |
| Contador de palavras, caracteres e tempo de leitura | Entra |
| Texto da direita para a esquerda, em árabe, hebraico e persa | Depois |

### 4.2 Organização

| Funcionalidade do Bear | Decisão |
|---|---|
| Tag aninhada com `#` | Depois. A primeira versão organiza só por pasta |
| Tag em qualquer lugar do texto, inclusive no título | Depois |
| Ícone por tag, as TagCons | Depois |
| Fixar tag na barra lateral | Depois |
| Renomear e apagar tag em toda a base | Depois. É reescrita em massa de arquivos |
| Tag como espaço de trabalho | Fora |
| Fixar nota no topo | Entra. Vira favorito, guardado fora do arquivo |
| Arquivar nota | Fora. Mover para outra pasta resolve |
| Lixeira própria | Fora. Usa a lixeira do sistema operacional |
| Lista de notas com ordenação, tamanho de prévia e miniatura de anexo | Entra |

### 4.3 Navegação

| Funcionalidade do Bear | Decisão |
|---|---|
| Sumário ao vivo pelos títulos | Entra |
| Backlinks, quem aponta para este arquivo | Entra. Exige índice da base |
| Painel lateral de informações, em abas | Entra |
| Esconder barra lateral e lista, em três modos de janela | Entra |
| Nota em janela separada | Depois |
| Voltar e avançar no histórico | Entra |
| Abertura rápida por nome, no estilo do `⌘O` | Entra |

### 4.4 Busca

| Funcionalidade do Bear | Decisão |
|---|---|
| Busca na lista de notas, por conteúdo | Entra. Com painel de resultados no estilo do `⇧⌘F` do VS Code |
| Busca dentro do arquivo aberto | Entra |
| Buscar e substituir | Entra |
| Operador especial `@untagged`, `@images`, `@files`, `@todo`, `@done` | Depois. O equivalente aqui seria por extensão, pasta e data |
| Ler texto dentro de imagem e de PDF | Fora |

### 4.5 Aparência

| Funcionalidade do Bear | Decisão |
|---|---|
| Biblioteca de temas, que no Bear passa de 28 | Entra. Dois na primeira versão, claro e escuro |
| Ícone do app alternativo | Fora |
| Escolher fonte do texto, do título e do código | Entra |
| Tamanho da fonte, altura da linha e largura da coluna | Entra |
| Espaçamento e recuo de parágrafo | Entra |
| Modo somente leitura | Entra |

Duas funcionalidades que vêm do iA Writer e eu proponho incluir: o modo foco, que escurece
o que não está sendo editado, e o modo máquina de escrever, que mantém a linha do cursor
centralizada.

### 4.6 Saída

| Funcionalidade do Bear | Decisão |
|---|---|
| Exportar Markdown e TXT | Entra. É copiar o arquivo |
| Exportar HTML | Entra |
| Exportar PDF | Entra |
| Imprimir | Entra |
| Exportar RTF, DOCX, ePub, JPG e TextBundle | Depois |
| Copiar link para a nota | Entra. Copia o caminho, absoluto ou relativo, como no VS Code |
| Publicar em blog | Fora |

### 4.7 Infraestrutura do Bear que não se aplica

Estas doze funcionalidades do Bear existem porque ele guarda as notas em banco próprio.
Aqui o arquivo é a fonte da verdade, e o sistema de arquivos já resolve cada caso:

- sincronização por iCloud;
- criptografia ponta a ponta;
- backup e restauração;
- resolução de conflito entre dispositivos;
- API `x-callback-url`;
- linha de comando para scripts;
- atalhos do sistema;
- widget;
- app de relógio;
- extensão de compartilhamento;
- importadores de Evernote, Apple Notes, Obsidian, Drafts, Day One e UpNote;
- transferência por AirDrop.

---

## 5. O que o Bear não tem e nós precisamos

Trabalhar sobre arquivos de verdade cria uma lista que o Bear não precisa ter.

### 5.1 Base e árvore de arquivos

A referência de comportamento é o Explorer do VS Code, não o Bear, que não tem árvore de
arquivos. O app precisa:

- abrir uma pasta como base e lembrar dela entre sessões;
- aceitar mais de uma pasta na mesma janela, como o workspace de várias raízes do VS Code;
- desenhar a árvore com pastas e arquivos, expandir e recolher, e lembrar o estado;
- recolher tudo por um botão, como o Collapse All;
- revelar na árvore o arquivo que está aberto, sozinho;
- filtrar a árvore enquanto a pessoa digita;
- criar, renomear com `F2`, duplicar, mover e apagar arquivo e pasta pela árvore;
- aceitar arrastar arquivo e pasta para dentro de outra pasta;
- mostrar só `.md`, `.markdown` e `.txt`, com opção de ver os outros em cinza;
- oferecer no menu de contexto revelar no Finder, copiar caminho e copiar caminho relativo;
- mandar o arquivo apagado para a lixeira do sistema, nunca apagar de vez.

### 5.2 Arquivos fora da base

Também como no VS Code: o arquivo solto abre em aba e não entra na árvore. O app precisa:

- abrir arquivo solto pelo diálogo do sistema, por arrastar para a janela, pelo terminal e
  por associação de tipo de arquivo;
- listar o que está aberto numa seção de editores abertos, no topo da barra lateral, com o
  caminho completo ao passar o mouse;
- guardar uma lista de recentes, com o caminho completo visível;
- oferecer promover a pasta do arquivo solto a base, em um clique.

### 5.3 Abas

O comportamento é o do VS Code. O app precisa:

- abrir em aba de prévia, em itálico, com um clique, e essa aba ser substituída pela
  próxima prévia;
- fixar a aba no duplo clique e na primeira tecla digitada;
- marcar a aba não salva com um ponto no lugar do X;
- reordenar arrastando, fechar com `⌘W` e reabrir a última fechada;
- restaurar a sessão anterior ao abrir o app;
- mostrar a trilha de pastas acima do editor, como os breadcrumbs.

A tela dividida fica para depois da primeira versão.

### 5.4 Arquivo mudou por fora

Este é o caso que mais destrói texto quando mal resolvido. O app precisa:

- detectar alteração externa e recarregar sozinho quando não há edição pendente;
- quando há edição pendente, avisar e deixar a pessoa escolher, sem perder texto;
- detectar arquivo apagado e arquivo renomeado por fora;
- salvar sozinho, em intervalo curto, e salvar ao perder o foco.

### 5.5 Detalhes de arquivo que doem quando se erra

O app precisa:

- preservar a codificação do arquivo, e avisar quando não for UTF-8;
- preservar o fim de linha original, LF ou CRLF, sem trocar em silêncio;
- preservar a linha em branco final, ou a falta dela;
- nunca reescrever o arquivo inteiro por causa de uma formatação automática;
- abrir `.txt` como texto puro, sem interpretar Markdown;
- abrir arquivo de alguns megabytes sem travar a janela.

### 5.6 Índice da base

O índice em memória guarda título, link, tag e data de cada arquivo, e alimenta a busca, os
wiki links, os backlinks e o autocompletar. O app monta o índice ao abrir a base, e atualiza
por evento do sistema de arquivos, sem varrer a pasta de novo.

---

## 6. A escrita seamless, em detalhe

O texto no disco é sempre Markdown puro. O que muda é só o desenho na tela.

| Situação | Comportamento |
|---|---|
| Cursor fora do trecho | a marcação some e o estilo fica, então `**bom**` vira **bom** |
| Cursor entra na linha | a marcação daquele trecho reaparece, e a linha não muda de altura |
| Seleção atravessa o trecho | mesmo comportamento da linha ativa |
| Título | o `#` some, o tamanho e o peso ficam, e o texto não muda de lugar |
| Link | mostra só o texto, clicável com tecla de modificador, e revela a URL ao entrar |
| Imagem | renderiza no lugar, e mostra o código ao entrar na linha |
| Tabela | renderiza como grade, e vira texto alinhado e editável ao entrar |
| Bloco de código | fica sempre visível como bloco, com realce e cerca discreta |
| Lista e tarefa | marcador desenhado, caixa clicável, recuo por nível |
| Citação e callout | barra e caixa desenhadas, e o `>` some |
| YAML front matter | bloco fechado no topo, expansível |
| Desfazer | uma ação da pessoa desfaz de uma vez, sem passo intermediário |
| Colar HTML | vira Markdown |
| Colar URL sobre texto selecionado | vira link |
| Digitar `- ` no começo da linha | vira lista na hora, e apagar desfaz |

Seis erros conhecidos de implementação que não podem acontecer:

- a linha mudar de altura ao entrar e sair, fazendo o texto tremer;
- piscar durante seleção arrastada com o mouse;
- o cursor pular de posição quando a marcação reaparece;
- selecionar tudo e copiar trazer o texto renderizado em vez do Markdown;
- a rolagem perder a posição quando um bloco pesado termina de renderizar;
- a digitação atrasar em arquivo grande porque a decoração é reconstruída inteira a cada tecla.

---

## 7. Interface

A interface é requisito de produto, não acabamento. Em concreto:

- três painéis, com barra lateral de bases e pastas, lista de arquivos e editor, e cada um
  se esconde por atalho dedicado;
- um tema é um conjunto fechado de cores para fundo, texto, título, link, marcação, seleção,
  código e barra lateral, com versão clara e escura, seguindo o sistema por padrão;
- tipografia com hierarquia real, onde o título não é só texto maior em negrito;
- largura de leitura confortável por padrão, na casa de 70 caracteres;
- animação curta e com propósito, que nunca atrase a digitação;
- estado vazio desenhado, em vez de tela branca;
- teclado em primeiro lugar, com atalho para toda ação de menu e uma paleta de comandos;
- contraste que passa em AA, navegação por teclado completa, e respeito à preferência de
  menos movimento e à fonte grande do sistema.

---

## 8. Proposta técnica

Uma base de código em TypeScript cobre as cinco plataformas, com CodeMirror 6 no editor e
Tauri 2 no empacotamento. Sujeito à entrevista.

- **Editor.** CodeMirror 6. É o que o Obsidian usa, e a API de `Decoration` dele foi feita
  para esconder e revelar marcação sem mexer no texto. As peças são `Decoration.replace`
  para sumir com os símbolos, `Decoration.widget` para tabela, imagem e diagrama,
  `Decoration.line` para o estilo do bloco, e um `StateField` que reconstrói o conjunto
  quando o documento ou a seleção muda. A árvore de sintaxe vem do `lezer-markdown`, que já
  entende CommonMark e aceita extensão.
- **Interface.** TypeScript com React ou Svelte, sobre uma camada de estilo com variáveis
  CSS. É a camada de variáveis que faz o sistema de temas ser barato.
- **Empacotamento.** Tauri 2 no macOS, Windows, iOS e Android, e o mesmo código servido como
  app web. O Tauri dá acesso nativo ao sistema de arquivos e ao observador de mudanças, e o
  binário sai pequeno. A alternativa conservadora no desktop é o Electron, ao custo de não
  cobrir o celular.
- **Web.** Usa a File System Access API onde ela existe, e cai para abrir e baixar arquivo
  onde não existe. Abrir uma pasta inteira no navegador depende de permissão que hoje só o
  Chromium concede, e essa é a principal limitação da versão web.
- **Sem banco de dados.** O índice se reconstrói a partir dos arquivos. Bases abertas,
  favoritos, tema e abas ficam em um arquivo de configuração por dispositivo.

Duas implementações abertas de live preview no estilo Obsidian servem de referência de
código: `atomic-editor` e `codemirror-live-markdown`. O Obsidian tem código fechado, então
dele se aprende comportamento observado, não fonte.

---

## 9. Decisões da entrevista de 2026-09-19

As decisões por funcionalidade estão nas tabelas da seção 4. Aqui ficam as sete que
atravessam o produto inteiro:

| Decisão | O que ficou |
|---|---|
| Por onde começar | macOS, e o Tauri leva o Windows logo depois |
| Editar ou só ler | edita e salva desde a primeira versão |
| Quem manda no visual | copiar o Bear de perto |
| Dialeto do Markdown | GitHub Flavored, mais callout, marca-texto e sublinhado do Bear |
| Árvore, arquivo solto e abas | copiar o Explorer do VS Code |
| Temas na primeira versão | dois, claro e escuro, com o motor pronto para o terceiro |
| Arquivo `.txt` | abre como texto puro, sem interpretar Markdown |

O que não é arquivo (favoritos, tema, sessão e abas abertas) fica fora da base, na pasta de
suporte do sistema. A pasta do usuário não recebe nenhum arquivo nosso.

O nome do projeto fica para depois. Até lá o repositório se chama `markdown-viewer`.
