// script.js dosyasının tamamı

const pusherAppKey = '32cbd69e4b950bf97679';
const pusherCluster = 'us2';
const channelName = 'chatrooms.25364532.v2';
const eventName = 'App\\Events\\ChatMessageEvent';

const startBtn = document.getElementById('startBtn');
const quizContent = document.getElementById('quizContent');
const questionEl = document.getElementById('question');
const timerEl = document.getElementById('timer');
const submitAnswerBtn = document.getElementById('submitAnswerBtn');

const messageBox = document.getElementById('messageBox');
const messageText = document.getElementById('messageText');
const confirmBtn = document.getElementById('confirmBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeMessageBtn = document.getElementById('closeMessageBtn');

const answerResultBox = document.getElementById('answerResultBox');
const answerResultText = document.getElementById('answerResultText');
const answerResultCloseBtn = document.getElementById('answerResultCloseBtn');

const questionTracker = document.getElementById('questionTracker'); // Yeni: Soru takipçisi elementi

let questions = [];
let currentQuestionIndex = 0;
let timerDuration = 30; // saniye
let timerInterval = null;
let votes = { A: 0, B: 0, C: 0, D: 0 };
let answerSelected = null;
let quizStarted = false;
let answerRevealed = false; 
let userHasAnswered = false; 

const optionEls = {
  A: document.getElementById('A'),
  B: document.getElementById('B'),
  C: document.getElementById('C'),
  D: document.getElementById('D'),
};
const voteBars = {
  A: optionEls.A.querySelector('.vote'),
  B: optionEls.B.querySelector('.vote'),
  C: optionEls.C.querySelector('.vote'),
  D: optionEls.D.querySelector('.vote'),
};
const voteTextEls = {
  A: optionEls.A.querySelector('.vote-count-text'),
  B: optionEls.B.querySelector('.vote-count-text'),
  C: optionEls.C.querySelector('.vote-count-text'),
  D: optionEls.D.querySelector('.vote-count-text'),
};

let roundQuestions = []; 

startBtn.addEventListener('click', () => {
  startBtn.style.display = 'none';
  quizContent.style.display = 'block';
  if (!quizStarted) {
    quizStarted = true;
    loadQuestions();
    setupPusher();
  }
});

submitAnswerBtn.addEventListener('click', () => {
    if (answerSelected) {
        showMessage('Emin misiniz?');
        submitAnswerBtn.disabled = true;
    } else {
        showMessage('Lütfen bir seçenek işaretleyin.');
    }
});

confirmBtn.addEventListener('click', () => {
    hideMessage();
    userHasAnswered = true; 
    checkAnswerAndShowResult(answerSelected);
    submitAnswerBtn.style.pointerEvents = 'none';
    submitAnswerBtn.style.opacity = '0.7';
    ['A', 'B', 'C', 'D'].forEach(opt => {
      optionEls[opt].style.pointerEvents = 'none';
    });
});

cancelBtn.addEventListener('click', () => {
    hideMessage();
    submitAnswerBtn.disabled = false;
});

closeMessageBtn.addEventListener('click', () => {
    hideMessage();
});

answerResultCloseBtn.addEventListener('click', () => {
    hideAnswerResult();
});

function goToNextQuestion() {
    hideAnswerResult();
    hideMessage();
    if (currentQuestionIndex < roundQuestions.length - 1) {
        showQuestion(currentQuestionIndex + 1);
    } else {
        showMessage('Tüm sorular tamamlandı! Yarışma sona erdi.');
        submitAnswerBtn.style.display = 'none';
    }
}

async function loadQuestions() {
  try {
    const res = await fetch('questions.json');
    if (!res.ok) throw new Error('questions.json dosyası yüklenemedi');
    questions = await res.json();
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('questions.json boş veya yanlış formatta');
    }
    prepareRound(); 
    if (roundQuestions.length === 0) {
      throw new Error('Round için soru bulunamadı. Lütfen questions.json dosyasını kontrol edin.');
    }
    showQuestion(0);
  } catch (err) {
    showMessage('Soru yüklenirken bir hata oluştu: ' + err.message);
    console.error(err);
  }
}

// Soru takipçisi için dinamik elemanları oluşturur
function createQuestionTracker() {
  questionTracker.innerHTML = ''; // Eski elementleri temizle
  for(let i = 0; i < roundQuestions.length; i++) {
    const trackerItem = document.createElement('div');
    trackerItem.className = 'tracker-item';
    trackerItem.textContent = i + 1;
    trackerItem.dataset.index = i;
    questionTracker.appendChild(trackerItem);
  }
}

function prepareRound() {
  roundQuestions = [];
  let allDifficultiesQuestions = [];
  for(let diff = 1; diff <= 5; diff++) {
    const filtered = questions.filter(q => q.difficulty === diff);
    const shuffled = filtered.sort(() => 0.5 - Math.random());
    allDifficultiesQuestions.push(...shuffled.slice(0, 3));
  }
  roundQuestions = allDifficultiesQuestions;
  createQuestionTracker(); // Tracker'ı burada oluştur
}

function showQuestion(index) {
  currentQuestionIndex = index;
  
  answerSelected = null;
  answerRevealed = false; 
  userHasAnswered = false;
  
  submitAnswerBtn.disabled = false;
  submitAnswerBtn.style.pointerEvents = 'auto';
  submitAnswerBtn.style.opacity = '1';

  ['A', 'B', 'C', 'D'].forEach((opt) => {
    optionEls[opt].style.pointerEvents = 'auto'; 
    optionEls[opt].classList.remove('correct', 'incorrect', 'selected');
  });

  resetVotes();
  updateVoteBars(false); 

  const q = roundQuestions[index];
  if (!q) {
    showMessage('Tüm sorular tamamlandı! Yarışma sona erdi.');
    questionEl.textContent = 'Yarışma Bitti!';
    clearInterval(timerInterval);
    submitAnswerBtn.style.display = 'none';
    return;
  }

  questionEl.textContent = q.question;
  ['A', 'B', 'C', 'D'].forEach((opt, i) => {
    optionEls[opt].querySelector('.text').textContent = q.options[i];
  });
  
  // Tracker'da aktif soruyu belirle
  const trackerItems = document.querySelectorAll('.tracker-item');
  trackerItems.forEach((item, i) => {
    item.classList.remove('active');
    if (i === currentQuestionIndex) {
      item.classList.add('active');
    }
  });

  if (currentQuestionIndex >= 5) {
    clearInterval(timerInterval);
    timerEl.style.display = 'none';
  } else {
    timerEl.style.display = 'block';
    resetTimer();
    startTimer();
  }

  submitAnswerBtn.style.display = 'block';
}

function resetVotes() {
  votes = { A: 0, B: 0, C: 0, D: 0 };
  ['A', 'B', 'C', 'D'].forEach(opt => {
    voteTextEls[opt].textContent = '';
    voteTextEls[opt].style.opacity = '0';
  });
}

function updateVoteBars(showPercentages = false) {
  const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
  ['A', 'B', 'C', 'D'].forEach(opt => {
    const percent = totalVotes ? (votes[opt] / totalVotes) * 100 : 0;
    voteBars[opt].style.width = percent + '%';
    if (showPercentages) {
        voteTextEls[opt].textContent = `${percent.toFixed(0)}% (${votes[opt]})`;
        voteTextEls[opt].style.opacity = '1';
        } else {
        voteTextEls[opt].textContent = `(${votes[opt]})`;
        voteTextEls[opt].style.opacity = '1';
        }
    });
}

let timeLeft = timerDuration;
function resetTimer() {
  clearInterval(timerInterval);
  timeLeft = timerDuration;
  timerEl.textContent = timeLeft;
  timerEl.style.color = 'var(--warning-color)';
  timerEl.style.animation = 'none';
}

function startTimer() {
  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 5) {
        timerEl.style.color = 'var(--incorrect-color)';
    }
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerEl.style.animation = 'none';
      showMessage('Süre doldu!'); 
      submitAnswerBtn.style.pointerEvents = 'none';
      submitAnswerBtn.style.opacity = '0.7';
      revealAnswer();
      setTimeout(goToNextQuestion, 5000); 
    }
  }, 1000);
}

function checkAnswerAndShowResult(selectedAnswer) {
    const currentQuestion = roundQuestions[currentQuestionIndex];
    if (currentQuestion) {
        const isCorrect = (selectedAnswer === currentQuestion.answer);
        const message = isCorrect ? 'Doğru cevap verdiniz!' : 'Yanlış cevap verdiniz.';
        showAnswerResult(message, isCorrect);
        revealAnswer();
        
        // Tracker'da soru durumunu güncelle
        const currentTrackerItem = document.querySelector(`.tracker-item[data-index="${currentQuestionIndex}"]`);
        if (currentTrackerItem) {
          if (isCorrect) {
            currentTrackerItem.classList.add('correct');
          } else {
            currentTrackerItem.classList.add('incorrect');
          }
        }

        setTimeout(hideAnswerResult, 3000);
        setTimeout(goToNextQuestion, 3500);
    }
}

function revealAnswer() {
    if (answerRevealed) return;
    clearInterval(timerInterval); 
    timerEl.style.animation = 'none';
    updateVoteBars(true);
    const currentQuestion = roundQuestions[currentQuestionIndex];
    if (currentQuestion) {
        optionEls[currentQuestion.answer].classList.add('correct');
        if (answerSelected && answerSelected !== currentQuestion.answer) {
            optionEls[answerSelected].classList.add('incorrect');
        }
    }
    answerRevealed = true; 
}

['A', 'B', 'C', 'D'].forEach(opt => {
  optionEls[opt].addEventListener('click', () => {
    if (!answerRevealed && !userHasAnswered) {
      if (answerSelected) {
        optionEls[answerSelected].classList.remove('selected');
      }
      answerSelected = opt;
      optionEls[opt].classList.add('selected');
    }
  });
});

function setupPusher() {
  const pusher = new Pusher(pusherAppKey, {
    cluster: pusherCluster,
    forceTLS: true,
  });
  const channel = pusher.subscribe(channelName);
    channel.bind(eventName, function(data) {
        try {
        let rawContent;
        if (data && typeof data === 'object') {
            if (data.data) {
                rawContent = data.data;
            } else if (data.message) {
                rawContent = data.message;
            } else {
                rawContent = JSON.stringify(data);
            }
        } else if (typeof data === 'string') {
            rawContent = data;
        }

        if (!rawContent) {
            console.error('Pusher verisi boş veya beklenen formatta değil:', data);
            return;
        }
        const parsedData = JSON.parse(rawContent);
        const content = parsedData.content ? parsedData.content.toUpperCase() : '';
        ['A', 'B', 'C', 'D'].forEach(opt => {
            if (content.includes(opt)) {
            votes[opt]++;
            if (!answerRevealed) {
                updateVoteBars(false);
            }
            }
        });
        } catch (e) {
        console.error('Veri işlenirken hata:', e, data);
        }
    });
}

function showMessage(msg) {
    messageText.textContent = msg;
    messageBox.style.display = 'block';
    
    if (msg.includes('Emin misiniz?')) {
        confirmBtn.style.display = 'inline-block';
        cancelBtn.style.display = 'inline-block';
        closeMessageBtn.style.display = 'none';
    } else {
        confirmBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        closeMessageBtn.style.display = 'inline-block';
        setTimeout(hideMessage, 4000);
    }
}

function hideMessage() {
    messageBox.style.display = 'none';
}

function showAnswerResult(msg, isCorrect) {
    answerResultText.textContent = msg;
    answerResultBox.style.display = 'block';
    answerResultBox.style.borderColor = isCorrect ? 'var(--correct-color)' : 'var(--incorrect-color)';
    answerResultBox.style.boxShadow = isCorrect ? '0 10px 30px rgba(40,167,69,0.7)' : '0 10px 30px rgba(220,53,69,0.7)';
}

function hideAnswerResult() {
    answerResultBox.style.display = 'none';
}

submitAnswerBtn.style.display = 'none';