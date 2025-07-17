const pusherAppKey = '32cbd69e4b950bf97679';
const pusherCluster = 'us2';
const channelName = 'chatrooms.25364532.v2';
const eventName = 'App\\Events\\ChatMessageEvent'; 

const startBtn = document.getElementById('startBtn');
const gameContent = document.getElementById('gameContent');
const playNextInstrumentBtn = document.getElementById('playNextInstrumentBtn');
const passBtn = document.getElementById('passBtn');
const nextSongBtn = document.getElementById('nextSongBtn');

const gameStatusEl = document.getElementById('gameStatus');
const currentInstrumentEl = document.getElementById('currentInstrument');
// audioPlayer başlangıçta id ile alınacak, sonra resetRoundState'te yeniden atanacak
let audioPlayer = document.getElementById('audioPlayer'); 
const audioPlayerContainer = document.getElementById('audioPlayerContainer'); // Yeni: Kapsayıcı element

const winnerDisplayEl = document.getElementById('winnerDisplay');
const leaderboardList = document.getElementById('leaderboardList');
const messageBox = document.getElementById('messageBox');
const messageText = document.getElementById('messageText');
const closeMessageBtn = document.getElementById('closeMessageBtn');

const guessInput = document.getElementById('guessInput');
const songSuggestionsDatalist = document.getElementById('songSuggestions');
const makeGuessBtn = document.getElementById('makeGuessBtn');

const pauseResumeBtn = document.getElementById('pauseResumeBtn');

const fixedInstrumentOrder = ["bass", "drum", "others", "vocals"];
const stepElements = [
    document.getElementById('step1'),
    document.getElementById('step2'),
    document.getElementById('step3'),
    document.getElementById('step4')
];

let allPossibleSongs = [];
let songsInPlay = []; 
let currentSong = null;
let currentInstrumentIndex = 0;
let timerInterval = null; 
let scores = { 'Yayıncı': 0 };
let roundActive = false; 
let isPlaying = false;

// Günlük Limit Sabitleri ve Yardımcı Fonksiyonlar
const DAILY_SONG_LIMIT = 3;
const LAST_PLAY_DATE_KEY = 'lastPlayDate';
const SONGS_PLAYED_TODAY_KEY = 'songsPlayedToday';

function getSongsPlayedToday() {
    const lastPlayDate = localStorage.getItem(LAST_PLAY_DATE_KEY);
    const songsPlayed = parseInt(localStorage.getItem(SONGS_PLAYED_TODAY_KEY) || '0', 10);
    const today = new Date().toDateString();

    if (lastPlayDate !== today) {
        localStorage.setItem(LAST_PLAY_DATE_KEY, today);
        localStorage.setItem(SONGS_PLAYED_TODAY_KEY, '0');
        return 0;
    }
    return songsPlayed;
}

function incrementSongsPlayedToday() {
    let songsPlayed = getSongsPlayedToday(); 
    songsPlayed++;
    localStorage.setItem(SONGS_PLAYED_TODAY_KEY, songsPlayed.toString());
}

// Event Listeners
startBtn.addEventListener('click', () => {
    startBtn.style.display = 'none';
    gameContent.classList.remove('hidden');
    loadAllSongsForSuggestions(); 
    loadGameSongs(); 
    setupPusher(); 
    updateLeaderboard();
});

guessInput.addEventListener('input', () => {
    updateSuggestions(guessInput.value);
});

playNextInstrumentBtn.addEventListener('click', playCurrentStepAudio); 

pauseResumeBtn.addEventListener('click', () => {
    if (audioPlayer.paused) {
        audioPlayer.play();
        isPlaying = true;
        pauseResumeBtn.textContent = 'Durdur';
    } else {
        audioPlayer.pause();
        isPlaying = false;
        pauseResumeBtn.textContent = 'Devam Et';
    }
});

passBtn.addEventListener('click', passGuess);
makeGuessBtn.addEventListener('click', handleBroadcasterGuess);
nextSongBtn.addEventListener('click', startNewRound);
closeMessageBtn.addEventListener('click', hideMessage);

async function loadAllSongsForSuggestions() {
    try {
        const res = await fetch('all_possible_songs.json');
        if (!res.ok) throw new Error('all_possible_songs.json dosyası yüklenemedi');
        const rawSongs = await res.json();

        const uniqueSongsMap = new Map();
        rawSongs.forEach(song => {
            const key = `${song.title.toLowerCase()} - ${song.artist.toLowerCase()}`;
            if (!uniqueSongsMap.has(key)) {
                uniqueSongsMap.set(key, song);
            }
        });
        allPossibleSongs = Array.from(uniqueSongsMap.values());
        
    } catch (err) {
        console.error('Tüm şarkılar öneriler için yüklenirken hata oluştu: ', err);
    }
}

async function loadGameSongs() {
    try {
        const res = await fetch('music_list.json');
        if (!res.ok) throw new Error('music_list.json dosyası yüklenemedi');
        songsInPlay = await res.json();
        if (!Array.isArray(songsInPlay) || songsInPlay.length === 0) {
            throw new Error('music_list.json boş veya yanlış formatta');
        }
        startNewRound();
    }
    catch (err) {
        showMessage('Şarkı listesi yüklenirken bir hata oluştu: ' + err.message);
        console.error(err);
    }
}

function populateSongSuggestions(songsToSuggest) {
    songSuggestionsDatalist.innerHTML = ''; 
    songsToSuggest.forEach(song => {
        const option = document.createElement('option');
        option.value = `${song.title} - ${song.artist}`;
        songSuggestionsDatalist.appendChild(option);
    });
}

function updateSuggestions(inputValue) {
    const minLength = 2; 
    
    if (inputValue.length < minLength) {
        songSuggestionsDatalist.innerHTML = ''; 
        return;
    }

    const lowerCaseInput = inputValue.toLowerCase();
    
    const filteredSongs = allPossibleSongs.filter(song => {
        const songTitle = song.title.toLowerCase();
        const songArtist = song.artist.toLowerCase();
        
        return songTitle.includes(lowerCaseInput) || songArtist.includes(lowerCaseInput);
    });

    const suggestionsToShow = filteredSongs.slice(0, 20); 
    populateSongSuggestions(suggestionsToShow);
}


function startNewRound() {
    const songsPlayed = getSongsPlayedToday();
    if (songsPlayed >= DAILY_SONG_LIMIT) {
        showMessage(`Günlük ${DAILY_SONG_LIMIT} şarkı tahmin limitinize ulaştınız. Yarın tekrar deneyin!`);
        playNextInstrumentBtn.style.display = 'none';
        passBtn.style.display = 'none';
        guessInput.disabled = true;
        makeGuessBtn.disabled = true;
        nextSongBtn.classList.add('hidden'); 
        gameStatusEl.textContent = 'Limit aşıldı.';
        return; 
    }

    if (songsInPlay.length === 0) {
        showMessage('Tüm şarkılar tamamlandı! Oyun bitti.');
        resetGameForRestart();
        return;
    }
    
    resetRoundState(); // Her tur başında oynatıcıyı resetler
    roundActive = true; 
    console.log('startNewRound - roundActive:', roundActive);

    const randomIndex = Math.floor(Math.random() * songsInPlay.length);
    currentSong = songsInPlay[randomIndex];
    songsInPlay.splice(randomIndex, 1);
    console.log('startNewRound: Yeni şarkı seçildi:', currentSong.title, '-', currentSong.artist, 'Prefix:', currentSong.fileNamePrefix); 

    gameStatusEl.textContent = 'Yeni şarkı yükleniyor. Başlamak için "Enstrümanı Çal"a basın.';
    currentInstrumentEl.textContent = '';
    
    guessInput.disabled = false;
    makeGuessBtn.disabled = false;
    guessInput.value = "";
    songSuggestionsDatalist.innerHTML = ''; 

    playNextInstrumentBtn.style.display = 'inline-block'; 
    passBtn.style.display = 'none'; 
    nextSongBtn.classList.add('hidden');
    
    currentInstrumentIndex = 0; 
    stepElements.forEach(el => el.classList.remove('active', 'correct', 'incorrect'));
}

function resetRoundState() {
    clearInterval(timerInterval); 
    winnerDisplayEl.classList.add('hidden'); 
    winnerDisplayEl.textContent = '';
    winnerDisplayEl.style.color = ''; 
    winnerDisplayEl.style.backgroundColor = '';

    // BUG FIX: AudioPlayer'ı tamamen yeniden oluştur
    if (audioPlayer) { // Elementin var olduğundan emin ol
        audioPlayer.pause();
        // Event listener'ları kaldır (Bellek sızıntısını önler)
        audioPlayer.onloadedmetadata = null; 
        audioPlayer.onerror = null; 
        audioPlayerContainer.removeChild(audioPlayer);
    }
    // Yeni bir audio elementi oluştur ve DOM'a ekle
    const newAudioPlayer = document.createElement('audio');
    newAudioPlayer.id = 'audioPlayer';
    newAudioPlayer.src = '';
    audioPlayerContainer.appendChild(newAudioPlayer);
    audioPlayer = newAudioPlayer; // Global audioPlayer değişkenini yeni elemente ata

    isPlaying = false; 
    pauseResumeBtn.classList.add('hidden'); 
    pauseResumeBtn.textContent = 'Durdur'; 
    
    roundActive = false; 
    console.log('resetRoundState - roundActive:', roundActive);

    guessInput.disabled = true;
    makeGuessBtn.disabled = true;
    guessInput.value = "";
    songSuggestionsDatalist.innerHTML = ''; 

    playNextInstrumentBtn.style.display = 'inline-block';
    passBtn.style.display = 'none';
    nextSongBtn.classList.add('hidden');
    
    currentInstrumentIndex = 0; 
    stepElements.forEach(el => el.classList.remove('active', 'correct', 'incorrect'));
}

function resetGameForRestart() {
    startBtn.style.display = 'block';
    gameContent.classList.add('hidden');
    loadGameSongs(); 
    scores = { 'Yayıncı': 0 };
    updateLeaderboard(); 
}

function playCurrentStepAudio() {
    console.log('playCurrentStepAudio fonksiyonu çağrıldı. currentInstrumentIndex:', currentInstrumentIndex); 
    console.log('playCurrentStepAudio: currentSong.fileNamePrefix:', currentSong.fileNamePrefix); 

    if (currentInstrumentIndex >= fixedInstrumentOrder.length) {
        console.log('Tüm ipuçları çalındı. Tahmin yapılamadı.'); 
        endRound('no_guess_after_all_clues');
        return;
    }

    // Ses yüklenirken veya oynatılırken oluşabilecek hataları yakalar
    audioPlayer.onerror = (e) => {
        console.error(`Ses dosyası yüklenemedi: ${audioPlayer.src}`, e); 
        showMessage(`Hata: "${fixedInstrumentOrder[currentInstrumentIndex]}" ses dosyası bulunamadı. Sonraki adıma geçiliyor.`);
        
        currentInstrumentIndex++; 
        if (currentInstrumentIndex < fixedInstrumentOrder.length) {
            setTimeout(playCurrentStepAudio, 2000); 
        } else {
            endRound('no_guess_after_all_clues');
        }
    };
    
    const instrumentName = fixedInstrumentOrder[currentInstrumentIndex];
    const audioPath = `songs/${currentSong.fileNamePrefix}-${instrumentName}.mp3`; 
    
    audioPlayer.src = audioPath; // Yeni kaynağı ata
    audioPlayer.load(); // Oynatıcıyı yeni kaynağı yüklemeye zorla

    // Ses dosyasının meta verileri yüklendiğinde çalmaya başla
    audioPlayer.onloadedmetadata = () => {
        console.log(`playCurrentStepAudio: "${audioPath}" yüklendi. Çalmaya başlanıyor.`);
        audioPlayer.play()
            .then(() => {
                isPlaying = true; 
                pauseResumeBtn.textContent = 'Durdur'; 
                pauseResumeBtn.classList.remove('hidden'); 
            })
            .catch(error => {
                console.error("Ses otomatik oynatılamadı veya çalma hatası:", error);
                showMessage("Ses otomatik oynatılamadı. Tarayıcı ayarlarınızı kontrol edin veya tekrar deneyin.");
                isPlaying = false; 
                pauseResumeBtn.textContent = 'Devam Et';
                pauseResumeBtn.classList.remove('hidden'); 
            });
    };

    currentInstrumentEl.textContent = `${currentInstrumentIndex + 1}. Adım: ${instrumentName.charAt(0).toUpperCase() + instrumentName.slice(1)} çalıyor...`;
    gameStatusEl.textContent = 'Tahmin bekleniyor...';

    stepElements.forEach((el, index) => {
        el.classList.remove('active');
        if (index === currentInstrumentIndex) {
            el.classList.add('active');
        }
    });
    
    roundActive = true; 
    console.log('playCurrentStepAudio sonu - roundActive:', roundActive); 

    playNextInstrumentBtn.style.display = 'inline-block';
    passBtn.style.display = 'inline-block'; 
    guessInput.disabled = false;
    makeGuessBtn.disabled = false;
}

function passGuess() {
    console.log('Pas Geç butonuna tıklandı.'); 
    console.log('passGuess başlangıcı - roundActive:', roundActive, 'currentInstrumentIndex:', currentInstrumentIndex); 

    if (!roundActive) {
        console.log('Pas geçilemez, tur aktif değil.');
        showMessage('Oyun turu aktif değil. Lütfen önce enstrümanı çalın.');
        return;
    }

    stepElements[currentInstrumentIndex].classList.add('incorrect'); 

    currentInstrumentIndex++; 
    console.log('passGuess sonrası - currentInstrumentIndex:', currentInstrumentIndex); 

    if (currentInstrumentIndex < fixedInstrumentOrder.length) {
        showMessage('Pas geçildi. Bir sonraki ipucu geliyor...');
        console.log('Sonraki enstrüman çalmak için setTimeout çağrıldı.'); 
        
        audioPlayer.pause();
        isPlaying = false;
        pauseResumeBtn.classList.add('hidden');
        pauseResumeBtn.textContent = 'Durdur'; 

        setTimeout(playCurrentStepAudio, 2000); 
    } else {
        console.log('Tüm ipuçları pas geçildi, tur bitiriliyor.'); 
        endRound('pass_all_clues'); 
    }
}

function cleanString(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/[^a-zA-Z0-9\sÇçĞğİıÖöŞşÜü]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function handleBroadcasterGuess() {
    console.log('Tahmin Yap butonuna tıklandı.'); 
    console.log('roundActive durumu:', roundActive); 
    
    if (!roundActive) {
        console.log('roundActive false, tahmin yapılamaz.');
        showMessage('Oyun turu aktif değil. Lütfen önce enstrümanı çalın.');
        return;
    }

    const typedGuess = guessInput.value.trim();
    if (!typedGuess) {
        showMessage('Lütfen bir şarkı adı yazın.');
        return;
    }

    const cleanTypedGuess = cleanString(typedGuess);
    const cleanCurrentTitle = cleanString(currentSong.title);
    const cleanCurrentArtist = cleanString(currentSong.artist);
    
    const cleanFullCorrectAnswer = cleanString(`${currentSong.title} - ${currentSong.artist}`);

    console.log('--- Tahmin Karşılaştırma Detayları ---');
    console.log('Temizlenmiş Tahmin (Kullanıcı):', cleanTypedGuess);
    console.log('Temizlenmiş Doğru Başlık (Hedef):', cleanCurrentTitle);
    console.log('Temizlenmiş Doğru Sanatçı (Hedef):', cleanCurrentArtist);
    console.log('Temizlenmiş Tam Doğru Cevap (Hedef - Başlık+Sanatçı):', cleanFullCorrectAnswer);
    console.log('--- Son ---');


    if (cleanTypedGuess === cleanCurrentTitle || 
        cleanTypedGuess === cleanCurrentArtist ||
        cleanTypedGuess === cleanFullCorrectAnswer) { 
        console.log('TAHMİN: DOĞRU OLARAK ALGILANDI!'); 
        stepElements[currentInstrumentIndex].classList.add('correct');
        endRound('correct', 'Yayıncı');
    } else {
        console.log('TAHMİN: YANLIŞ OLARAK ALGILANDI.'); 
        stepElements[currentInstrumentIndex].classList.add('incorrect');
        showMessage('Yanlış tahmin! Tekrar deneyin veya Pas Geçin.');
    }
    guessInput.value = "";
    songSuggestionsDatalist.innerHTML = ''; 
}

function endRound(reason, winner = '') {
    clearInterval(timerInterval); 
    roundActive = false; 
    console.log('endRound - roundActive:', roundActive); 

    audioPlayer.pause();
    isPlaying = false; 
    pauseResumeBtn.classList.add('hidden'); 
    
    let message = '';
    let messageColor = '';

    if (reason === 'correct') {
        message = `${winner} doğru bildi! Şarkı: ${currentSong.title} (${currentSong.artist})`;
        messageColor = 'var(--correct-color)';
        scores['Yayıncı']++;
    } else if (reason === 'pass_all_clues') {
        message = `Tüm ipuçları pas geçildi! Doğru cevap: ${currentSong.title} (${currentSong.artist})`;
        messageColor = 'var(--warning-color)';
    } else if (reason === 'no_guess_after_all_clues') {
        message = `Tüm enstrümanlar çalındı ve tahmin yapılamadı! Doğru cevap: ${currentSong.title} (${currentSong.artist})`;
        messageColor = 'var(--incorrect-color)';
    }
    
    winnerDisplayEl.textContent = message;
    winnerDisplayEl.style.color = messageColor;
    winnerDisplayEl.classList.remove('hidden');
    
    playNextInstrumentBtn.style.display = 'none';
    passBtn.style.display = 'none';
    guessInput.disabled = true;
    makeGuessBtn.disabled = true;
    nextSongBtn.classList.remove('hidden');
    
    updateLeaderboard();
    incrementSongsPlayedToday(); 
}

function updateLeaderboard() {
    if (leaderboardList) { 
        leaderboardList.innerHTML = '';
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.textContent = `Yayıncı: ${scores['Yayıncı']} puan`;
        leaderboardList.appendChild(item);
    } else {
        console.error("Hata: 'leaderboardList' elementi bulunamadı. Lütfen music_guess.html dosyasını kontrol edin.");
    }
}

function setupPusher() {
    const pusher = new Pusher(pusherAppKey, {
        cluster: pusherCluster,
        forceTLS: true,
    });
    const channel = pusher.subscribe(channelName);
    channel.bind(eventName, function(data) {
        console.log('Chatten gelen mesaj (tahmin için kullanılmıyor):', data);
    });
}

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