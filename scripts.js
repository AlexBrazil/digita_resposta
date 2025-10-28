(() => {
  const DATA_URL = 'data.json';
  const AUTO_ADVANCE_DELAY = 3500;

  document.addEventListener('DOMContentLoaded', async () => {
    const root = document.getElementById('flashcards-root');
    if (!root) {
      console.error('Elemento #flashcards-root não encontrado.');
      return;
    }

    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Não foi possível carregar ${DATA_URL} (status ${response.status}).`);
      }

      const data = await response.json();
      const app = new FlashcardsApp(root, data);
      app.init();
    } catch (error) {
      console.error(error);
      renderError(root, error);
    }
  });

  function renderError(root, error) {
    root.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'fc-app';

    const message = document.createElement('p');
    message.textContent = 'Não foi possível iniciar a atividade.';
    container.appendChild(message);

    const detail = document.createElement('pre');
    detail.textContent = error.message;
    container.appendChild(detail);

    root.appendChild(container);
  }

  class FlashcardsApp {
    constructor(root, config) {
      this.root = root;
      this.defaults = {
        description: '',
        progressText: '@card / @total',
        next: 'Next',
        previous: 'Previous',
        checkAnswerText: 'Verifique',
        showSolutionsRequiresInput: true,
        defaultAnswerText: 'Sua resposta',
        correctAnswerText: 'Correto',
        incorrectAnswerText: 'Incorreto',
        showSolutionText: 'Resposta correta',
        informationText: 'Informações',
        results: 'Resultados',
        ofCorrect: '@score de @total corretos',
        showResults: 'Mostrar resultados',
        answerShortText: 'A:',
        retry: 'Repetir',
        caseSensitive: false,
        cardAnnouncement: 'Resposta incorreta. A resposta correta foi @answer',
        correctAnswerAnnouncement: '@answer está correta.',
        pageAnnouncement: 'Página @current de @total',
        timerSeconds: null,
        randomCards: false,
        cards: []
      };

      this.config = Object.assign({}, this.defaults, config || {});
      this.originalCards = JSON.parse(JSON.stringify(this.config.cards || []));
      this.instanceId = `fc-${Math.random().toString(36).slice(2, 9)}`;

      this.cards = [];
      this.answers = [];
      this.status = [];
      this.numAnswered = 0;
      this.currentIndex = 0;
      this.pendingTimer = null;

      this.timerTotalSeconds = this.parseTimerSeconds(this.config.timerSeconds);
      this.remainingSeconds = this.timerTotalSeconds;
      this.timerInterval = null;
      this.timeExpired = false;

      this.refs = {};
    }

    init() {
      if (!this.originalCards.length) {
        throw new Error('Nenhum cartão foi configurado.');
      }

      this.resetState();
      this.render();
    }

    resetState() {
      this.cards = this.originalCards.map(card => this.prepareCard(this.cloneCard(card)));
      if (this.config.randomCards) {
        this.shuffle(this.cards);
      }
      this.answers = new Array(this.cards.length).fill(null);
      this.status = new Array(this.cards.length).fill('pending');
      this.numAnswered = 0;
      this.currentIndex = 0;
      this.clearPendingTimer();
      this.stopTimer();
      this.timeExpired = false;
      this.remainingSeconds = this.timerTotalSeconds;
    }

    cloneCard(card) {
      return JSON.parse(JSON.stringify(card));
    }

    prepareCard(rawCard) {
      const card = Object.assign({}, rawCard);
      const variants = [];
      const normalizedSet = new Set();

      const collectVariant = value => {
        if (typeof value !== 'string') {
          return;
        }
        const cleaned = this.cleanAnswerValue(value);
        if (!cleaned.length) {
          return;
        }
        const normalized = this.normalizeAnswer(value);
        if (!normalized.length || normalizedSet.has(normalized)) {
          return;
        }
        normalizedSet.add(normalized);
        variants.push(cleaned);
      };

      if (Array.isArray(card.answers)) {
        card.answers.forEach(collectVariant);
      }

      if (!variants.length) {
        throw new Error('Pelo menos uma resposta deve ser configurada para cada cartão.');
      }

      card.answerVariants = variants;
      card.normalizedAnswers = Array.from(normalizedSet);
      card.primaryAnswer = variants[0];
      return card;
    }

    render() {
      this.root.innerHTML = '';
      this.refs = {};

      const app = document.createElement('div');
      app.className = 'fc-app';
      this.refs.app = app;

      const main = document.createElement('div');
      main.className = 'fc-main';
      this.refs.main = main;

      const descriptionId = `${this.instanceId}-description`;
      const description = document.createElement('div');
      description.className = 'fc-description';
      description.id = descriptionId;
      description.textContent = this.config.description;
      main.appendChild(description);

      const progressRow = document.createElement('div');
      progressRow.className = 'fc-progress-row';
      this.refs.progressRow = progressRow;
      main.appendChild(progressRow);

      const progressText = document.createElement('div');
      progressText.className = 'fc-progress';
      this.refs.progressText = progressText;
      progressRow.appendChild(progressText);

      if (this.hasTimer()) {
        const timer = this.createTimer();
        progressRow.appendChild(timer);
        this.createTimeUpModal(app);
      }

      const visualProgress = document.createElement('div');
      visualProgress.className = 'fc-visual-progress';
      visualProgress.setAttribute('role', 'progressbar');
      visualProgress.setAttribute('aria-valuemin', '0');
      visualProgress.setAttribute('aria-valuemax', '100');
      visualProgress.setAttribute('aria-valuenow', '0');

      const visualProgressInner = document.createElement('div');
      visualProgressInner.className = 'fc-visual-progress-inner';
      visualProgress.appendChild(visualProgressInner);

      this.refs.visualProgress = visualProgress;
      this.refs.visualProgressInner = visualProgressInner;
      main.appendChild(visualProgress);

      const inner = document.createElement('div');
      inner.className = 'fc-inner';
      inner.setAttribute('role', 'region');
      inner.setAttribute('aria-roledescription', 'carousel');
      inner.setAttribute('aria-labelledby', descriptionId);
      this.refs.cardsContainer = inner;
      main.appendChild(inner);

      const navigation = document.createElement('div');
      navigation.className = 'fc-navigation';

      const prevButton = document.createElement('button');
      prevButton.type = 'button';
      prevButton.className = 'fc-button fc-nav-button is-secondary';
      prevButton.textContent = this.config.previous;
      prevButton.addEventListener('click', () => this.goToPrev());
      navigation.appendChild(prevButton);
      this.refs.prevButton = prevButton;

      const nextButton = document.createElement('button');
      nextButton.type = 'button';
      nextButton.className = 'fc-button fc-nav-button';
      nextButton.textContent = this.config.next;
      nextButton.addEventListener('click', () => this.goToNext());
      navigation.appendChild(nextButton);
      this.refs.nextButton = nextButton;

      main.appendChild(navigation);

      const showResultsWrapper = document.createElement('div');
      showResultsWrapper.className = 'fc-show-results';

      const showResultsIcon = document.createElement('span');
      showResultsIcon.className = 'fc-show-results-icon';
      showResultsWrapper.appendChild(showResultsIcon);

      const showResultsButton = document.createElement('button');
      showResultsButton.type = 'button';
      showResultsButton.className = 'fc-show-results-label';
      showResultsButton.textContent = this.config.showResults;
      showResultsWrapper.appendChild(showResultsButton);

      const showResultsButtonMobile = document.createElement('button');
      showResultsButtonMobile.type = 'button';
      showResultsButtonMobile.className = 'fc-show-results-label-mobile';
      showResultsButtonMobile.textContent = this.config.results;
      showResultsWrapper.appendChild(showResultsButtonMobile);

      [showResultsButton, showResultsButtonMobile].forEach(button => {
        button.addEventListener('click', () => this.showResults());
      });

      this.refs.showResultsWrapper = showResultsWrapper;
      main.appendChild(showResultsWrapper);

      const results = document.createElement('div');
      results.className = 'fc-results';
      results.setAttribute('aria-live', 'polite');
      this.refs.resultsPanel = results;

      const resultsTitle = document.createElement('div');
      resultsTitle.className = 'fc-results-title';
      resultsTitle.textContent = this.config.results;
      results.appendChild(resultsTitle);

      const resultsScore = document.createElement('div');
      resultsScore.className = 'fc-results-score';
      this.refs.resultsScore = resultsScore;
      results.appendChild(resultsScore);

      const resultsList = document.createElement('ul');
      resultsList.className = 'fc-results-list';
      this.refs.resultsList = resultsList;
      results.appendChild(resultsList);

      const retryButton = document.createElement('button');
      retryButton.type = 'button';
      retryButton.className = 'fc-button fc-retry';
      retryButton.textContent = this.config.retry;
      retryButton.addEventListener('click', () => this.resetTask());
      this.refs.retryButton = retryButton;
      results.appendChild(retryButton);

      const ariaAnnouncer = document.createElement('div');
      ariaAnnouncer.className = 'sr-only';
      ariaAnnouncer.setAttribute('aria-live', 'assertive');
      this.refs.ariaAnnouncer = ariaAnnouncer;

      const pageAnnouncer = document.createElement('div');
      pageAnnouncer.className = 'sr-only';
      pageAnnouncer.setAttribute('aria-live', 'assertive');
      this.refs.pageAnnouncer = pageAnnouncer;

      app.appendChild(main);
      app.appendChild(results);
      app.appendChild(ariaAnnouncer);
      app.appendChild(pageAnnouncer);

      this.root.appendChild(app);

      this.renderCards();
      this.goToIndex(0);
      this.updateNavigation();
      this.updateProgress();
      this.updateTimerDisplay();
      this.updateShowResultsVisibility();
      this.startTimer();
    }

    hasTimer() {
      return Number.isInteger(this.timerTotalSeconds) && this.timerTotalSeconds > 0;
    }

    parseTimerSeconds(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
      }
      return Math.floor(numeric);
    }

    createTimer() {
      const timer = document.createElement('div');
      timer.className = 'fc-timer';
      timer.setAttribute('role', 'timer');

      const label = document.createElement('span');
      label.className = 'fc-timer-label';
      label.textContent = 'Tempo restante';
      timer.appendChild(label);

      const value = document.createElement('span');
      value.className = 'fc-timer-value';
      value.setAttribute('aria-live', 'polite');
      value.textContent = '--:--';
      timer.appendChild(value);

      this.refs.timerContainer = timer;
      this.refs.timerValue = value;

      return timer;
    }

    createTimeUpModal(parent) {
      const existingModal = this.refs.timeUpModal;
      if (existingModal && existingModal.parentElement === parent) {
        return;
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'fc-timeup-backdrop';
      backdrop.hidden = true;

      const modal = document.createElement('div');
      modal.className = 'fc-timeup-modal';
      modal.hidden = true;
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      const titleId = `${this.instanceId}-timeup-title`;
      modal.setAttribute('aria-labelledby', titleId);

      const content = document.createElement('div');
      content.className = 'fc-timeup-content';

      const title = document.createElement('h2');
      title.className = 'fc-timeup-title';
      title.id = titleId;
      title.textContent = 'Tempo esgotado';
      content.appendChild(title);

      const message = document.createElement('p');
      message.className = 'fc-timeup-message';
      message.textContent = 'O tempo da atividade terminou. Escolha uma opção para continuar.';
      content.appendChild(message);

      const actions = document.createElement('div');
      actions.className = 'fc-timeup-actions';

      const retryButton = document.createElement('button');
      retryButton.type = 'button';
      retryButton.className = 'fc-button fc-timeup-button is-secondary';
      retryButton.textContent = 'Repetir';
      retryButton.addEventListener('click', () => {
        this.hideTimeUpModal();
        this.resetTask();
      });
      actions.appendChild(retryButton);

      const resultsButton = document.createElement('button');
      resultsButton.type = 'button';
      resultsButton.className = 'fc-button fc-timeup-button';
      resultsButton.textContent = 'Mostrar resultados';
      resultsButton.addEventListener('click', () => {
        this.hideTimeUpModal();
        this.showResults(true);
      });
      actions.appendChild(resultsButton);

      content.appendChild(actions);
      modal.appendChild(content);

      parent.appendChild(backdrop);
      parent.appendChild(modal);

      this.refs.timeUpBackdrop = backdrop;
      this.refs.timeUpModal = modal;
      this.refs.timeUpRepeatButton = retryButton;
      this.refs.timeUpResultsButton = resultsButton;
    }

    startTimer() {
      if (!this.hasTimer()) {
        return;
      }
      this.stopTimer();
      if (!Number.isInteger(this.remainingSeconds)) {
        this.remainingSeconds = this.timerTotalSeconds;
      }
      this.updateTimerDisplay();
      if (this.remainingSeconds <= 0) {
        this.handleTimerExpired();
        return;
      }
      this.timerInterval = window.setInterval(() => {
        if (!Number.isInteger(this.remainingSeconds)) {
          this.remainingSeconds = 0;
        } else {
          this.remainingSeconds -= 1;
        }
        if (this.remainingSeconds <= 0) {
          this.remainingSeconds = 0;
          this.updateTimerDisplay();
          this.handleTimerExpired();
          this.stopTimer();
          return;
        }
        this.updateTimerDisplay();
      }, 1000);
    }

    stopTimer() {
      if (this.timerInterval) {
        window.clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }

    disableRemainingInputs() {
      if (!Array.isArray(this.inputEls) || !Array.isArray(this.checkButtons)) {
        return;
      }
      this.inputEls.forEach(input => {
        if (input && !input.disabled) {
          input.disabled = true;
        }
      });
      this.checkButtons.forEach(button => {
        if (button && !button.disabled) {
          button.disabled = true;
        }
      });
      if (this.refs.prevButton) {
        this.refs.prevButton.disabled = true;
      }
      if (this.refs.nextButton) {
        this.refs.nextButton.disabled = true;
      }
    }

    showTimeUpModal() {
      if (!this.refs.timeUpModal || !this.refs.timeUpBackdrop) {
        return;
      }
      this.refs.timeUpBackdrop.hidden = false;
      this.refs.timeUpModal.hidden = false;
      this.refs.timeUpBackdrop.classList.add('is-visible');
      this.refs.timeUpModal.classList.add('is-visible');
      if (this.refs.timeUpRepeatButton) {
        this.refs.timeUpRepeatButton.focus();
      }
    }

    hideTimeUpModal() {
      if (!this.refs.timeUpModal || !this.refs.timeUpBackdrop) {
        return;
      }
      this.refs.timeUpBackdrop.hidden = true;
      this.refs.timeUpModal.hidden = true;
      this.refs.timeUpBackdrop.classList.remove('is-visible');
      this.refs.timeUpModal.classList.remove('is-visible');
    }

    handleTimerExpired() {
      if (this.timeExpired) {
        return;
      }
      this.timeExpired = true;
      this.clearPendingTimer();
      this.updateTimerDisplay();
      if (this.refs.timerContainer) {
        this.refs.timerContainer.classList.add('is-finished');
        this.refs.timerContainer.classList.remove('is-ending');
      }
      this.disableRemainingInputs();
      this.stopTimer();
      this.showTimeUpModal();
      this.ariaAnnounce('Tempo esgotado.');
    }

    updateTimerDisplay() {
      if (!this.hasTimer() || !this.refs.timerValue) {
        return;
      }
      const fallback = Number.isInteger(this.timerTotalSeconds) ? this.timerTotalSeconds : 0;
      const seconds = Math.max(0, Number.isInteger(this.remainingSeconds) ? this.remainingSeconds : fallback);
      const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
      const secs = (seconds % 60).toString().padStart(2, '0');
      this.refs.timerValue.textContent = `${minutes}:${secs}`;

      if (this.refs.timerContainer) {
        const isEnding = seconds > 0 && seconds <= 15;
        this.refs.timerContainer.classList.toggle('is-ending', isEnding);
        this.refs.timerContainer.classList.toggle('is-finished', seconds === 0);
      }
    }

    renderCards() {
      const container = this.refs.cardsContainer;
      container.innerHTML = '';

      this.cardEls = [];
      this.inputEls = [];
      this.checkButtons = [];
      this.feedbackAreas = [];

      this.cards.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'fc-card';
        cardEl.dataset.index = String(index);
        cardEl.setAttribute('role', 'group');
        cardEl.setAttribute('aria-roledescription', 'slide');
        cardEl.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');

        const cardOverlay = document.createElement('button');
        cardOverlay.type = 'button';
        cardOverlay.className = 'fc-card-overlay';
        cardOverlay.tabIndex = -1;
        cardOverlay.setAttribute('aria-hidden', 'true');
        cardOverlay.addEventListener('click', () => {
          if (cardEl.classList.contains('is-prev') || cardEl.classList.contains('is-left')) {
            this.goToPrev();
          } else if (cardEl.classList.contains('is-next') || cardEl.classList.contains('is-right')) {
            this.goToNext();
          }
        });
        cardEl.appendChild(cardOverlay);

        const cardHolder = document.createElement('div');
        cardHolder.className = 'fc-cardholder';
        cardEl.appendChild(cardHolder);

        const imageHolder = document.createElement('div');
        imageHolder.className = 'fc-imageholder';

        if (card.image) {
          const img = document.createElement('img');
          img.className = 'fc-image';
          img.src = card.image;
          img.alt = card.altText || card.text || '';
          imageHolder.appendChild(img);
        } else {
          imageHolder.classList.add('without-image');
        }

        cardHolder.appendChild(imageHolder);

        const foot = document.createElement('div');
        foot.className = 'fc-foot';

        const questionId = `${this.instanceId}-card-${index}`;
        const question = document.createElement('div');
        question.className = 'fc-question';
        question.id = questionId;
        question.textContent = card.text || '';
        foot.appendChild(question);
        cardEl.setAttribute('aria-labelledby', questionId);

        const answerWrapper = document.createElement('div');
        answerWrapper.className = 'fc-answer';
        foot.appendChild(answerWrapper);

        const inputGroup = document.createElement('div');
        inputGroup.className = 'fc-input';
        answerWrapper.appendChild(inputGroup);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fc-textinput';
        input.placeholder = this.config.defaultAnswerText;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('aria-describedby', questionId);
        inputGroup.appendChild(input);

        const checkButton = document.createElement('button');
        checkButton.type = 'button';
        checkButton.className = 'fc-button fc-check';
        checkButton.textContent = this.config.checkAnswerText;
        checkButton.addEventListener('click', () => this.handleCheck(index));
        inputGroup.appendChild(checkButton);

        if (card.tip) {
          const tipButton = document.createElement('button');
          tipButton.type = 'button';
          tipButton.className = 'fc-tip';
          tipButton.textContent = this.config.informationText;
          tipButton.setAttribute('title', card.tip);
          tipButton.addEventListener('click', () => {
            this.ariaAnnounce(card.tip);
          });
          answerWrapper.appendChild(tipButton);
        }

        input.addEventListener('keydown', event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            this.handleCheck(index);
          }
        });

        input.addEventListener('input', () => {
          input.classList.remove('is-required');
        });

        this.cardEls.push(cardEl);
        this.inputEls.push(input);
        this.checkButtons.push(checkButton);
        this.feedbackAreas.push({ wrapper: answerWrapper, imageHolder });

        cardHolder.appendChild(foot);
        container.appendChild(cardEl);
      });
    }

    handleCheck(index) {
      if (this.status[index] !== 'pending') {
        return;
      }

      const input = this.inputEls[index];
      const userAnswer = input.value.trim();
      const card = this.cards[index];
      const isCorrect = this.isCorrectAnswer(card, userAnswer);

      if (!userAnswer && this.config.showSolutionsRequiresInput && !isCorrect) {
        input.classList.add('is-required');
        input.focus();
        return;
      }

      this.status[index] = isCorrect ? 'correct' : 'wrong';
      this.answers[index] = userAnswer;
      this.numAnswered += 1;

      input.disabled = true;

      const checkButton = this.checkButtons[index];
      checkButton.disabled = true;

      const { wrapper, imageHolder } = this.feedbackAreas[index];

      const feedback = document.createElement('div');
      feedback.className = `fc-feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`;
      const readableAnswer = userAnswer || this.decodeHtml(card.primaryAnswer || '');
      feedback.textContent = isCorrect
        ? `${this.config.correctAnswerText}! Você digitou "${readableAnswer}".`
        : `${this.config.incorrectAnswerText}. Confira a resposta correta acima.`;
      wrapper.appendChild(feedback);

      const solution = document.createElement('div');
      solution.className = 'fc-solution';

      const solutionHeader = document.createElement('div');
      solutionHeader.className = 'fc-solution-text';
      const solutionLabel = document.createElement('span');
      solutionLabel.textContent = `${this.config.showSolutionText}: `;
      solutionHeader.appendChild(solutionLabel);
      const solutionValue = document.createElement('span');
      solutionValue.textContent = this.formatSolution(card);
      solutionValue.className = 'fc-results-correct';
      solutionHeader.appendChild(solutionValue);
      solution.appendChild(solutionHeader);

      if (!isCorrect && userAnswer) {
        const attemptText = document.createElement('div');
        attemptText.className = 'fc-solution-text';
        attemptText.textContent = `Sua resposta: ${userAnswer}`;
        solution.appendChild(attemptText);
      }

      imageHolder.appendChild(solution);
      const cardEl = this.cardEls[index];
      cardEl.classList.add(isCorrect ? 'is-correct' : 'is-wrong');

      const decodedAnswer = this.decodeHtml(card.primaryAnswer || '');
      const announcedAnswer = userAnswer ? userAnswer : decodedAnswer;
      if (isCorrect) {
        const text = this.config.correctAnswerAnnouncement.replace('@answer', announcedAnswer);
        this.ariaAnnounce(text);
      } else {
        const text = this.config.cardAnnouncement.replace('@answer', decodedAnswer);
        this.ariaAnnounce(text);
      }

      if (this.numAnswered >= this.cards.length) {
        this.stopTimer();
        this.goToIndex(this.cards.length - 1);
        this.updateShowResultsVisibility();
      } else if (index < this.cards.length - 1) {
        this.scheduleNext(() => this.goToNext());
      } else {
        this.updateShowResultsVisibility();
      }
    }

    scheduleNext(callback) {
      this.clearPendingTimer();
      this.pendingTimer = window.setTimeout(() => {
        this.pendingTimer = null;
        callback();
      }, AUTO_ADVANCE_DELAY);
    }

    clearPendingTimer() {
      if (this.pendingTimer) {
        window.clearTimeout(this.pendingTimer);
        this.pendingTimer = null;
      }
    }

    goToNext() {
      if (this.currentIndex >= this.cards.length - 1) {
        return;
      }
      this.clearPendingTimer();
      this.goToIndex(this.currentIndex + 1);
    }

    goToPrev() {
      if (this.currentIndex === 0) {
        return;
      }
      this.clearPendingTimer();
      this.goToIndex(this.currentIndex - 1);
      this.updateShowResultsVisibility();
    }

    goToIndex(index) {
      if (index < 0 || index >= this.cards.length) {
        return;
      }

      this.currentIndex = index;

      this.cardEls.forEach((cardEl, cardIndex) => {
        if (!cardEl) {
          return;
        }
        cardEl.classList.remove('is-current', 'is-prev', 'is-next', 'is-left', 'is-right');

        if (cardIndex === index) {
          cardEl.classList.add('is-current');
          cardEl.setAttribute('aria-hidden', 'false');
        } else {
          cardEl.setAttribute('aria-hidden', 'true');
          if (cardIndex === index - 1) {
            cardEl.classList.add('is-prev');
          } else if (cardIndex === index + 1) {
            cardEl.classList.add('is-next');
          } else if (cardIndex < index) {
            cardEl.classList.add('is-left');
          } else {
            cardEl.classList.add('is-right');
          }
        }
      });

      this.updateNavigation();
      this.updateProgress();
      this.focusCurrentInput();
      this.announcePage();
      this.updateShowResultsVisibility();
    }

    focusCurrentInput() {
      const input = this.inputEls[this.currentIndex];
      if (input && !input.disabled) {
        input.focus();
      }
    }

    updateNavigation() {
      if (!this.refs.prevButton || !this.refs.nextButton) {
        return;
      }

      const hasPrev = this.currentIndex > 0;
      const hasNext = this.currentIndex < this.cards.length - 1;

      this.refs.prevButton.hidden = !hasPrev;
      this.refs.nextButton.hidden = !hasNext;

      if (this.cards.length <= 1) {
        this.refs.nextButton.hidden = true;
        this.refs.prevButton.hidden = true;
      }
    }

    updateProgress() {
      const current = this.currentIndex + 1;
      const total = this.cards.length;
      const progressText = (this.config.progressText || '@card / @total')
        .replace(/@card/g, current)
        .replace(/@total/g, total);

      if (this.refs.progressText) {
        this.refs.progressText.textContent = progressText;
      }

      if (this.refs.visualProgress && this.refs.visualProgressInner) {
        const percent = (current / total) * 100;
        this.refs.visualProgressInner.style.width = `${percent}%`;
        this.refs.visualProgress.setAttribute('aria-valuenow', percent.toFixed(2));
      }
    }

    updateShowResultsVisibility() {
      if (!this.refs.showResultsWrapper) {
        return;
      }

      const shouldShow = this.numAnswered >= this.cards.length && this.currentIndex === this.cards.length - 1;
      if (shouldShow) {
        this.refs.showResultsWrapper.classList.add('is-visible');
      } else {
        this.refs.showResultsWrapper.classList.remove('is-visible');
      }
    }

    announcePage() {
      if (!this.refs.pageAnnouncer) {
        return;
      }
      const text = (this.config.pageAnnouncement || '')
        .replace('@current', this.currentIndex + 1)
        .replace('@total', this.cards.length);
      this.refs.pageAnnouncer.textContent = text;
    }

    ariaAnnounce(message) {
      if (!this.refs.ariaAnnouncer) {
        return;
      }
      this.refs.ariaAnnouncer.textContent = message;
    }

    showResults(force = false) {
      const canShow = this.numAnswered >= this.cards.length || this.timeExpired || force;
      if (!canShow) {
        return;
      }

      this.clearPendingTimer();
      this.stopTimer();
      this.hideTimeUpModal();
      this.populateResults();

      if (this.refs.main) {
        this.refs.main.hidden = true;
      }
      if (this.refs.showResultsWrapper) {
        this.refs.showResultsWrapper.classList.remove('is-visible');
      }
      this.refs.resultsPanel.classList.add('is-visible');
      this.refs.resultsPanel.scrollTop = 0;
    }

    populateResults() {
      const score = this.getScore();
      const max = this.cards.length;
      const template = this.config.ofCorrect || '@score de @total corretos';
      const html = template
        .replace(/@score/g, `<span>${score}</span>`)
        .replace(/@total/g, `<span>${max}</span>`);

      this.refs.resultsScore.innerHTML = html;

      this.refs.resultsList.innerHTML = '';

      this.cards.forEach((card, index) => {
        const item = document.createElement('li');
        item.className = 'fc-results-item';
        if (this.status[index] !== 'correct') {
          item.classList.add('is-wrong');
        }

        const imageContainer = document.createElement('div');
        imageContainer.className = 'fc-results-image';
        if (card.image) {
          const resultImg = document.createElement('img');
          resultImg.src = card.image;
          resultImg.alt = card.altText || card.text || '';
          imageContainer.appendChild(resultImg);
        } else {
          imageContainer.classList.add('is-empty');
        }
        item.appendChild(imageContainer);

        const questionWrapper = document.createElement('div');
        questionWrapper.className = 'fc-results-question';
        questionWrapper.textContent = card.text || '';
        item.appendChild(questionWrapper);

        const answer = document.createElement('div');
        answer.className = 'fc-results-answer';
        const shortLabel = document.createElement('span');
        shortLabel.textContent = `${this.config.answerShortText} `;
        answer.appendChild(shortLabel);

        const answerValue = document.createElement('span');
        const userAnswer = this.answers[index];
        const hasAnswer = typeof userAnswer === 'string' && userAnswer.trim().length > 0;
        answerValue.textContent = hasAnswer ? userAnswer : 'Sem resposta';
        answer.appendChild(answerValue);

        if (this.status[index] !== 'correct') {
          const solutionSeparator = document.createElement('span');
          solutionSeparator.textContent = ` ${this.config.showSolutionText}: `;
          answer.appendChild(solutionSeparator);

          const correctAnswer = document.createElement('span');
          correctAnswer.className = 'fc-results-correct';
          correctAnswer.textContent = this.formatSolution(card);
          answer.appendChild(correctAnswer);
        }

        item.appendChild(answer);
        this.refs.resultsList.appendChild(item);
      });

      if (this.refs.retryButton) {
        this.refs.retryButton.hidden = score === max;
      }
    }

    resetTask() {
      this.hideTimeUpModal();
      this.resetState();
      this.render();
    }

    getScore() {
      return this.cards.reduce((total, card, index) => {
        return total + (this.isCorrectAnswer(card, this.answers[index]) ? 1 : 0);
      }, 0);
    }

    isCorrectAnswer(card, userAnswer) {
      const normalizedAnswers = Array.isArray(card.normalizedAnswers) ? card.normalizedAnswers : [];
      if (!normalizedAnswers.length) {
        return false;
      }

      const normalizedUser = this.normalizeAnswer(userAnswer);
      if (!normalizedUser.length) {
        return false;
      }
      return normalizedAnswers.includes(normalizedUser);
    }

    formatSolution(card) {
      const variants = Array.isArray(card.answerVariants) ? card.answerVariants : [];
      if (!variants.length) {
        return '';
      }
      return variants.join(', ');
    }

    shuffle(array) {
      for (let i = array.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }

    decodeHtml(value) {
      const temp = document.createElement('div');
      temp.innerHTML = value;
      return temp.textContent || temp.innerText || '';
    }

    cleanAnswerValue(value) {
      if (value === null || value === undefined) {
        return '';
      }
      return this.decodeHtml(String(value)).trim();
    }

    normalizeAnswer(value) {
      const cleaned = this.cleanAnswerValue(value);
      if (!cleaned.length) {
        return '';
      }
      const collapsed = cleaned.replace(/\s+/g, ' ');
      if (this.config.caseSensitive) {
        return collapsed;
      }
      return collapsed.toLocaleLowerCase();
    }
  }

})();
