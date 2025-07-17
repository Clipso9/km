const pusherAppKey = '32cbd69e4b950bf97679';
const pusherCluster = 'us2';
const channelName = 'chatrooms.25364532.v2';
const eventName = 'App\\Events\\ChatMessageEvent';

const startBtn = document.getElementById('startBtn');
const gameContent = document.getElementById('gameContent');
const timerEl = document.getElementById('timer');
const gameStatusEl = document.getElementById('gameStatus');
const hiddenTitleEl = document.getElementById('hiddenTitle');
const winnerDisplayEl = document.getElementById('winnerDisplay');
const leaderboardList = document.getElementById('leaderboardList');
const movieInfoContainer = document.getElementById('movieInfoContainer');
const movieTitleDisplay = document.getElementById('movieTitleDisplay');
const movieOriginDisplay = document.getElementById('movieOriginDisplay');
const nextRoundBtn = document.getElementById('nextRoundBtn');
const passBtn = document.getElementById('passBtn');
const categoryYerliRadio = document.getElementById('categoryYerli');
const categoryYabanciRadio = document.getElementById('categoryYabanci');

const messageBox = document.getElementById('messageBox');
const messageText = document.getElementById('messageText');
const closeMessageBtn = document.getElementById('closeMessageBtn');

let allMovies = [];
let movies = [];
let currentMovie = '';
let currentMovieOrigin = '';
let timerDuration = 90; // saniye
let timerInterval = null;
let scores = {};
let roundActive = false;

startBtn.addEventListener('click', () => {
    startBtn.style.display = 'none';
    gameContent.style.display = 'block';
    movieInfoContainer.classList.remove('hidden');
    loadMovies();
    setupPusher();
});

// "Sonraki Film" butonu için addEventListener
nextRoundBtn.addEventListener('click', startNewRound);

// "Pas" butonunun tıklama olayı - Direkt yeni turu başlatır.
passBtn.addEventListener('click', () => {
    if (roundActive) {
        startNewRound();
    }
});

closeMessageBtn.addEventListener('click', () => {
    hideMessage();
});

async function loadMovies() {
  try {
    const res = await fetch('charades_movies.json');
    if (!res.ok) throw new Error('charades_movies.json dosyası yüklenemedi');
    allMovies = await res.json();
    if (!Array.isArray(allMovies) || allMovies.length === 0) {
      throw new Error('charades_movies.json boş veya yanlış formatta');
    }
    filterMoviesByCategory();
    startNewRound();
  } catch (err) {
    showMessage('Film listesi yüklenirken bir hata oluştu: ' + err.message);
    console.error(err);
  }
}

function filterMoviesByCategory() {
    const selectedCategory = document.querySelector('input[name="category"]:checked').value;
    movies = allMovies.filter(movie => movie.country === selectedCategory);
}

function startNewRound() {
  if (movies.length === 0) {
    showMessage('Seçtiğiniz kategori için film kalmadı! Lütfen başka bir kategori seçin.');
    return;
  }
  resetRoundState();
  
  const randomIndex = Math.floor(Math.random() * movies.length);
  const selectedMovie = movies[randomIndex];
  currentMovie = selectedMovie.title;
  currentMovieOrigin = selectedMovie.country;
  movies.splice(randomIndex, 1);

  movieTitleDisplay.textContent = currentMovie;
  movieOriginDisplay.textContent = `(${currentMovieOrigin.charAt(0).toUpperCase() + currentMovieOrigin.slice(1)})`;
  displayHiddenTitle();
  startTimer();
  gameStatusEl.textContent = 'Tahminler bekleniyor...';
  roundActive = true;
  passBtn.style.display = 'inline-block';
}

function resetRoundState() {
  clearInterval(timerInterval);
  timerEl.textContent = timerDuration;
  timerEl.style.color = 'var(--warning-color)';
  winnerDisplayEl.classList.add('hidden');
  winnerDisplayEl.textContent = '';
//   nextRoundBtn.style.display = 'none';
  passBtn.style.display = 'none';
}

function displayHiddenTitle() {
  const hidden = currentMovie.split(' ').map(word => {
    const underscoredWord = word.split('').map(char => '_').join(' ');
    return underscoredWord;
  }).join('   ');
  hiddenTitleEl.textContent = hidden;
}

function startTimer() {
  let timeLeft = timerDuration;
  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 10) {
      timerEl.style.color = 'var(--incorrect-color)';
    }
    if (timeLeft <= 0) {
      endRound('timeout');
    }
  }, 1000);
}

function endRound(reason, winner = '') {
  clearInterval(timerInterval);
  roundActive = false;
  hiddenTitleEl.textContent = currentMovie;
  
  if (reason === 'correct') {
    winnerDisplayEl.textContent = `${winner} doğru bildi!`;
    winnerDisplayEl.classList.remove('hidden');
    winnerDisplayEl.style.color = 'var(--correct-color)';
    updateScores(winner);
    // Doğru tahmin yapıldığında 3 saniye sonra yeni tura geç
    setTimeout(startNewRound, 3000);
  } else if (reason === 'timeout') {
    winnerDisplayEl.textContent = `Süre doldu! Doğru cevap: ${currentMovie}`;
    winnerDisplayEl.classList.remove('hidden');
    winnerDisplayEl.style.color = 'var(--incorrect-color)';
    // Süre dolduğunda yeni tura geçmek için butonu göster
    nextRoundBtn.style.display = 'inline-block';
  }
  
  passBtn.style.display = 'none';
}

function updateScores(username) {
  if (!scores[username]) {
    scores[username] = 0;
  }
  scores[username] += 1;
  updateLeaderboard();
}

function updateLeaderboard() {
  const sortedScores = Object.entries(scores).sort(([, a], [, b]) => b - a);
  leaderboardList.innerHTML = '';
  sortedScores.forEach(([user, score]) => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    item.textContent = `${user}: ${score} puan`;
    leaderboardList.appendChild(item);
  });
}

function setupPusher() {
  const pusher = new Pusher(pusherAppKey, {
    cluster: pusherCluster,
    forceTLS: true,
  });
  const channel = pusher.subscribe(channelName);
  channel.bind(eventName, function(data) {
    if (!roundActive) return;
    try {
      let payload;
      if (data.data) {
        payload = JSON.parse(data.data);
      } else {
        payload = data;
      }

      const content = payload.content ? payload.content.toUpperCase() : '';
      const username = payload.sender && payload.sender.username ? payload.sender.username : 'Anonim';
      
      const cleanGuess = content.replace(/[^A-Z0-9\s]/g, '');
      const cleanMovie = currentMovie.toUpperCase().replace(/[^A-Z0-9\s]/g, '');

      if (cleanGuess === cleanMovie) {
        endRound('correct', username);
      }
    } catch (e) {
      console.error('Veri işlenirken hata:', e, data);
    }
  });
}
    
function showMessage(msg) {
    messageText.textContent = msg;
    messageBox.style.display = 'block';
    closeMessageBtn.classList.remove('hidden');
}

function hideMessage() {
    messageBox.style.display = 'none';
    closeMessageBtn.classList.add('hidden');
}