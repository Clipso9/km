const pusherAppKey = '32cbd69e4b950bf97679'; // Pusher API Anahtarınız
const pusherCluster = 'us2'; // Pusher Cluster'ınız
const channelName = 'chatrooms.25364532.v2'; // Twitch chat odası kanal adınız
const eventName = 'App\\Events\\ChatMessageEvent'; 

// HTML Elementleri
const startTabooBtn = document.getElementById('startTabooBtn');
const tabooGameContent = document.getElementById('tabooGameContent');
const timerEl = document.getElementById('timer');
const mainWordEl = document.getElementById('mainWord');
const forbiddenWordsListEl = document.getElementById('forbiddenWordsList');
const correctGuessBtn = document.getElementById('correctGuessBtn');
const passBtn = document.getElementById('passBtn');
const tabooWordUsedBtn = document.getElementById('tabooWordUsedBtn');
const roundMessageEl = document.getElementById('roundMessage');

const leaderboardListEl = document.getElementById('leaderboardList'); 

const messageBox = document.getElementById('messageBox');
const messageText = document.getElementById('messageText');
const closeMessageBtn = document.getElementById('closeMessageBtn');

// Oyun Değişkenleri
let tabooWords = []; 
let wordsInPlay = []; 
let currentWord = null; 
let timerInterval = null;
const roundDuration = 60; 
// let currentScore = 0; // YAYINCI PUANI KALDIRILDI
let gameActive = false; 

let chatScores = {}; 

// Event Listeners
startTabooBtn.addEventListener('click', () => {
    startTabooBtn.style.display = 'none';
    tabooGameContent.classList.remove('hidden');
    loadTabooWords();
    setupPusher(); 
    updateLeaderboard(); 
});

correctGuessBtn.addEventListener('click', () => {
    showMessage('Doğru tahmin chatten gelmeli!'); 
});

// PAS GEÇ BUTONU GÜNCELLENDİ: Limit ve mesaj kaldırıldı, direkt yeni kelimeye geçiş
passBtn.addEventListener('click', () => {
    if (!gameActive) return; 

    clearInterval(timerInterval); 
    gameActive = false; 
    disableControlButtons(); 
    
    startNewRound(); // Direkt yeni kelimeye geç
});

tabooWordUsedBtn.addEventListener('click', () => handleRoundEnd('taboo'));
closeMessageBtn.addEventListener('click', hideMessage);

// Kelimeleri yükle
async function loadTabooWords() {
    try {
        const res = await fetch('taboo_words.json');
        if (!res.ok) throw new Error('taboo_words.json dosyası yüklenemedi.');
        tabooWords = await res.json();
        if (!Array.isArray(tabooWords) || tabooWords.length === 0) {
            throw new Error('taboo_words.json boş veya yanlış formatta.');
        }
        wordsInPlay = [...tabooWords]; 
        startNewRound();
    } catch (err) {
        showMessage('Tabu kelimeleri yüklenirken bir hata oluştu: ' + err.message);
        console.error(err);
    }
}

// Yeni Tur Başlatma
function startNewRound() {
    if (wordsInPlay.length === 0) {
        showMessage('Tüm kelimeler tamamlandı! Oyun bitti.'); // Yayıncı puanı kaldırıldığı için toplam puan burada gösterilmez
        resetGameForRestart();
        return;
    }

    resetRoundState(); 
    gameActive = true; 

    const randomIndex = Math.floor(Math.random() * wordsInPlay.length);
    currentWord = wordsInPlay[randomIndex];
    wordsInPlay.splice(randomIndex, 1); 

    mainWordEl.textContent = currentWord.word;
    forbiddenWordsListEl.innerHTML = '';
    currentWord.forbidden.forEach(fWord => {
        const li = document.createElement('li');
        li.textContent = fWord;
        forbiddenWordsListEl.appendChild(li);
    });

    startTimer(); 
    enableControlButtons(); 
}

// Tur Durumunu Sıfırla
function resetRoundState() {
    clearInterval(timerInterval);
    timerEl.textContent = roundDuration;
    roundMessageEl.classList.add('hidden');
    gameActive = false; 
    disableControlButtons(); 
}

// Oyun Yeniden Başlatma Durumu
function resetGameForRestart() {
    startTabooBtn.style.display = 'block';
    tabooGameContent.classList.add('hidden');
    wordsInPlay = [...tabooWords]; 
    // currentScore = 0; // Yayıncı puanı kaldırıldığı için sıfırlama da kaldırıldı
    chatScores = {}; 
    updateLeaderboard(); 
}

// Zamanlayıcı Fonksiyonu
function startTimer() {
    let timeLeft = roundDuration;
    timerEl.textContent = timeLeft;
    timerEl.style.color = 'var(--warning-color)';

    timerInterval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;
        if (timeLeft <= 10) { 
            timerEl.style.color = 'var(--incorrect-color)';
        }
        if (timeLeft <= 0) {
            handleRoundEnd('timeout');
        }
    }, 1000);
}

// Tur Bitişini Yönet
function handleRoundEnd(reason, chatGuesser = null) {
    if (!gameActive) return; 

    clearInterval(timerInterval);
    gameActive = false; 
    disableControlButtons(); 

    let message = '';
    let messageColor = '';
    let points = 0;

    if (reason === 'correct') {
        points = 10; 
        if (chatGuesser) { 
            if (!chatScores[chatGuesser]) chatScores[chatGuesser] = 0;
            chatScores[chatGuesser] += points;
            message = `${chatGuesser} doğru bildi! Kelime: "${currentWord.word}"`; 
        } 
        messageColor = 'var(--correct-color)';
    } 
    // Pas geçme durumu artık handleRoundEnd'e mesaj veya puan için gelmiyor
    // else if (reason === 'pass') { } 
    else if (reason === 'taboo') {
        message = `Yasaklı kelime kullanıldı! Kelime: "${currentWord.word}"`;
        messageColor = 'var(--incorrect-color)';
        // points = -10; // Ceza kaldırıldı
    } else if (reason === 'timeout') {
        message = `Süre doldu! Kelime: "${currentWord.word}"`;
        messageColor = 'var(--incorrect-color)';
        // points = -10; // Ceza kaldırıldı
    }
    
    roundMessageEl.textContent = message;
    roundMessageEl.style.color = messageColor;
    roundMessageEl.classList.remove('hidden');

    updateLeaderboard(); 

    // Her tur bitiş sebebinden sonra otomatik yeni kelimeye geç (pas hariç)
    // Pas geçme direkt kendi butonunda halledildiği için burada koşul yok.
    setTimeout(startNewRound, 3000); 
}

// Kontrol Butonlarını Aktif Et/Devre Dışı Bırak
function enableControlButtons() {
    correctGuessBtn.disabled = false; 
    passBtn.disabled = false; 
    tabooWordUsedBtn.disabled = false;
}

function disableControlButtons() {
    correctGuessBtn.disabled = true;
    passBtn.disabled = true;
    tabooWordUsedBtn.disabled = true;
}

// Puan Tablosunu Güncelle
function updateLeaderboard() {
    if (leaderboardListEl) {
        leaderboardListEl.innerHTML = '';
        
        // Yayıncının puanı tamamen kaldırıldığı için streamerItem oluşturulmuyor
        // const streamerItem = document.createElement('li');
        // streamerItem.className = 'leaderboard-item';
        // streamerItem.textContent = `Yayıncı: ${currentScore} puan`;
        // leaderboardListEl.appendChild(streamerItem);

        const sortedChatScores = Object.entries(chatScores).sort(([, a], [, b]) => b - a);
        sortedChatScores.forEach(([user, score]) => {
            const item = document.createElement('li');
            item.className = 'leaderboard-item';
            item.textContent = `${user}: ${score} puan`;
            leaderboardListEl.appendChild(item);
        });

    } else {
        console.error("Hata: 'leaderboardList' elementi bulunamadı. Lütfen taboo.html dosyasını kontrol edin.");
    }
}

// Mesaj Kutusu Fonksiyonları
function showMessage(msg) {
    messageText.textContent = msg;
    messageBox.style.display = 'block';
    closeMessageBtn.classList.remove('hidden');
    setTimeout(hideMessage, 4000); 
}

function hideMessage() {
    messageBox.style.display = 'none';
    closeMessageBtn.classList.add('hidden');
}

// Pusher Entegrasyonu (Chat tahminlerini dinler)
function setupPusher() {
    const pusher = new Pusher(pusherAppKey, {
        cluster: pusherCluster,
        forceTLS: true,
    });
    const channel = pusher.subscribe(channelName);
    channel.bind(eventName, function(data) {
        if (!gameActive || !currentWord) return; 

        let chatMessage = data.content ? data.content.toLowerCase().trim() : '';
        let senderUsername = data.sender && data.sender.username ? data.sender.username : 'Anonim';

        const cleanChatMessage = chatMessage.replace(/[^a-zA-Z0-9\sÇçĞğİıÖöŞşÜü]/g, '').replace(/\s+/g, ' ').trim();
        const cleanCurrentWord = currentWord.word.toLowerCase().replace(/[^a-zA-Z0-9\sÇçĞğİıÖöŞşÜü]/g, '').replace(/\s+/g, ' ').trim();

        if (cleanChatMessage === cleanCurrentWord) {
            handleRoundEnd('correct', senderUsername); 
        } 
    });
}