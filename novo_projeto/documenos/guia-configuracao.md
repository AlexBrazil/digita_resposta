# Guia de Configuração do `data.json`

Este documento descreve detalhadamente como configurar a atividade “Digite a Resposta” utilizando o arquivo `data.json`. As orientações abaixo abrangem todos os campos aceitos, exemplos práticos e observações importantes para personalizar o comportamento da aplicação.

## 1. Estrutura Geral

O arquivo `data.json` deve exportar um objeto com chaves de configuração global e a lista `cards`. Um exemplo completo:

```json
{
  "description": "Digite o nome das figuras geométricas",
  "progressText": "Cartão @card de @total",
  "next": "Próximo",
  "previous": "Anterior",
  "checkAnswerText": "Verifique",
  "showSolutionsRequiresInput": true,
  "defaultAnswerText": "Sua resposta",
  "correctAnswerText": "Correto",
  "incorrectAnswerText": "Incorreto",
  "showSolutionText": "Resposta correta",
  "results": "Resultados",
  "ofCorrect": "@score de @total corretos",
  "showResults": "Mostrar resultados",
  "answerShortText": "A:",
  "informationText": "Informações",
  "retry": "Repetir",
  "caseSensitive": false,
  "cardAnnouncement": "Resposta incorreta. A resposta correta foi @answer",
  "correctAnswerAnnouncement": "@answer está correta.",
  "pageAnnouncement": "Página @current de @total",
  "timerSeconds": 120,
  "randomCards": true,
  "cards": [
    {
      "text": "Qual o nome desta figura geométrica?",
      "answers": ["Quadrado"],
      "tip": "",
      "image": "assets/image-C12Baxt2.png"
    }
  ]
}
```

> **Observação:** Todos os campos de texto aceitam caracteres especiais. Salve o arquivo em UTF-8 para evitar problemas de acentuação.

## 2. Campos Globais

| Campo                     | Tipo      | Obrigatório | Descrição                                                                                           |
|---------------------------|-----------|-------------|-----------------------------------------------------------------------------------------------------|
| `description`             | string    | sim         | Texto exibido no topo da atividade.                                                                 |
| `progressText`            | string    | não         | Mensagem que indica o progresso. Use `@card` para o índice atual e `@total` para o total de cartões.|
| `next`, `previous`        | string    | não         | Rótulos dos botões de navegação.                                                                   |
| `checkAnswerText`         | string    | não         | Texto do botão que valida a resposta.                                                              |
| `showSolutionsRequiresInput` | boolean | não         | Impede a validação sem digitar algo quando `true`.                                                  |
| `defaultAnswerText`       | string    | não         | Placeholder do campo de resposta.                                                                   |
| `correctAnswerText`       | string    | não         | Texto usado em feedback positivo.                                                                  |
| `incorrectAnswerText`     | string    | não         | Texto usado em feedback negativo.                                                                  |
| `showSolutionText`        | string    | não         | Prefixo antes da resposta correta exibida.                                                         |
| `results`, `showResults`  | string    | não         | Rótulos do painel de resultados e do botão que abre esse painel.                                   |
| `ofCorrect`               | string    | não         | Template para pontuação final (`@score`, `@total`).                                                 |
| `answerShortText`         | string    | não         | Prefixo usado ao listar respostas no painel de resultados.                                         |
| `informationText`         | string    | não         | Rótulo do botão de dica, quando usado.                                                             |
| `retry`                   | string    | não         | Texto do botão que reinicia a atividade.                                                           |
| `caseSensitive`           | boolean   | não         | Quando `true`, diferencia maiúsculas/minúsculas. Por padrão (`false`), a comparação ignora casos.   |
| `cardAnnouncement`        | string    | não         | Mensagem de acessibilidade anunciada ao errar (`@answer` é substituído pela resposta correta).     |
| `correctAnswerAnnouncement`| string   | não         | Mensagem anunciada ao acertar (`@answer` vira a resposta digitada).                                |
| `pageAnnouncement`        | string    | não         | Texto anunciado quando o usuário troca de cartão (`@current`, `@total`).                           |
| `timerSeconds`            | number    | não         | Define a duração do cronômetro em segundos. O timer só aparece quando esse valor é positivo.       |
| `randomCards`             | boolean   | não         | Embaralha os cartões no início quando `true`.                                                       |
| `cards`                   | array     | sim         | Lista de objetos descrevendo cada cartão (detalhes na seção 3).                                    |

### 2.1. Cronômetro (`timerSeconds`)

Quando `timerSeconds` é definido:

- Um painel com o tempo restante aparece ao lado da barra de progresso (desktop) ou abaixo dela (telas estreitas).
- Nos últimos 15 segundos, o cronômetro pisca em vermelho para chamar atenção.
- Ao chegar a zero, o aplicativo encerra a contagem, anuncia “Tempo esgotado.” e exibe uma modal com duas opções:
  - **Repetir:** recomeça a atividade imediatamente.
  - **Mostrar resultados:** abre o painel de resultados; cartões que ficaram sem resposta são identificados como “Sem resposta”.

Exemplos:

```json
{
  "timerSeconds": 90
}
```

Para desabilitar o cronômetro, remova o campo ou defina `null`.

## 3. Cartões (`cards`)

Cada item em `cards` deve conter, no mínimo, `text` e `answers`. Estrutura recomendada:

```json
{
  "text": "Qual é a capital da França?",
  "answers": ["Paris"],
  "tip": "Cidade conhecida como a 'Cidade Luz'.",
  "image": "assets/paris.png"
}
```

- **`text` (string, obrigatório):** enunciado mostrado ao usuário.
- **`answers` (array de strings, obrigatório):** lista de respostas válidas. Todas as entradas são normalizadas (removendo espaços duplicados e respeitando `caseSensitive`). Se desejar aceitar variações, inclua-as na lista:

  ```json
  {
    "answers": ["Trapézio", "Trapezio", "Trapéseo", "Trapeseo"]
  }
  ```

- **`tip` (string, opcional):** texto exibido ao clicar no ícone de informação.
- **`image` (string, opcional):** caminho da imagem exibida no cartão. Use caminhos relativos ao `index.html`.
- **`altText` (string, opcional):** legenda alternativa para leitores de tela. Se ausente, o app usa `text`.

> **Importante:** O aplicativo exige pelo menos uma resposta por cartão. Caso `answers` esteja vazio ou ausente, a inicialização é interrompida com um erro claro no console.

## 4. Feedback e Resultados

- Ao validar um cartão:
  - **Acerto:** o usuário vê “Correto! Você digitou "RESPOSTA".” e o cronômetro continua.
  - **Erro:** aparece “Incorreto. Confira a resposta correta abaixo.” seguido da lista de respostas válidas e da resposta digitada.
- O painel de resultados mostra:
  - Imagem e enunciado de cada cartão.
  - Resposta digitada (ou “Sem resposta” se nada foi informado).
  - A resposta correta (listando todas as variantes fornecidas em `answers`).

## 5. Boas Práticas

1. **Encoding:** salve `data.json` em UTF-8 para preservar acentuação.
2. **Respostas claras:** mantenha a resposta “principal” como primeiro item na lista `answers`; ela será usada em mensagens de voz e feedbacks.
3. **Cronômetro:** evite tempos muito curtos (ex.: < 20 segundos) para permitir leitura e digitação confortáveis.
4. **Imagens:** comprima os arquivos em `assets/` para reduzir o tempo de carregamento.
5. **Testes locais:** após editar, recarregue a página com `Ctrl+F5` para forçar o navegador a buscar a configuração atualizada.

---

Com essas orientações, você pode personalizar o comportamento da atividade de maneira segura, previsível e didática. Caso precise ajustar o layout ou mensagens adicionais, consulte também `style.css` e `scripts.js`. Boas práticas de revisão incluem testar em resoluções diferentes e confirmar o comportamento do cronômetro quando ativado.
