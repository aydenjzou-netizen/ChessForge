const API_BASE = '/api';
const STORAGE_API_BASE = 'http://localhost:3001/api';
const TRAINING_XP_PER_LEVEL = 100;

// Chess instances
let board = null;      // chessboard.js instance
let game = null;       // chess.js instance (maintains the full game)
let gameHistory = [];  // Array of parsed moves from chess.js
let currentMoveIndex = -1; // -1 means starting position
let savedGames = [];   // Array of games loaded from the local filesystem backend
let fileStoreUnavailable = false;
let currentLoadedGame = null;
let chessComSyncInProgress = false;
let chessComBackgroundSyncStarted = false;
let chessComBackgroundSyncTimer = null;
let activeWinnerGroupCategory = null;

let currentSort = 'winner';
localStorage.setItem('chess_current_sort', currentSort);
const LIBRARY_GAME_LIMIT = 750;
const ANALYST_FEN_READING_GUIDE = `
FEN Reading Guide for Chess Analysis:
The AI text format includes fen: lines after half-moves. Each FEN describes the exact board position AFTER the move immediately above it.

A FEN has 6 fields:
1. Piece placement from rank 8 to rank 1. Uppercase pieces are White; lowercase pieces are Black. K/k king, Q/q queen, R/r rook, B/b bishop, N/n knight, P/p pawn. Numbers are empty squares.
2. Side to move: w means White to move, b means Black to move.
3. Castling rights: KQkq show available castling rights; - means none.
4. En passant target square, or - if none.
5. Halfmove clock for the fifty-move rule.
6. Fullmove number.

Use FEN evidence to describe the board naturally: piece placement, king safety, material balance, pawn structure, open files, castling rights, threats, and endgame structure.
Do not quote raw FEN strings unless the user asks for them.
Do not rely only on SAN move notation when a FEN is available.
If a tactic or relationship cannot be confidently inferred from the FEN evidence, say so instead of guessing.
`;

const ANALYST_CAUSAL_EXPLANATION_GUIDE = `
Causal Chess Analysis Guide:
Do not jump straight to the final result. The final result is only the conclusion, not the explanation.

When answering questions like "How did White win?", "Why did Black lose?", "What was the winning idea?", "How was this converted?", or "What led to the result?", ALWAYS explain the chain of causes that led up to the result.

Required reasoning order:
1. Identify the final result or final position briefly.
2. Work backward to find the key sequence that caused it.
3. Explain the buildup before the result: piece activity, king safety, pawn structure, material changes, threats, checks, captures, and forced moves.
4. Explain the decisive turning point.
5. Explain why the losing side could not fully recover.
6. End with the result only after the buildup and turning point are clear.

Avoid answers that only say the result, such as:
- "White won by checkmate."
- "Black resigned because White was winning."
- "The game ended 1-0."

Better answers should explain:
- what changed before the result
- which moves created the winning position
- what threats appeared
- what defensive resources failed
- how the final result became unavoidable

Use move evidence and FEN evidence when available. Prefer causal language such as "because", "this allowed", "this forced", "after this", and "the next moves show".
`;

function buildAnalystAiTextForRequest(currentAiText) {
    const text = currentAiText || '';
    if (!text.trim()) return text;
    if (!/fen\s*:/i.test(text)) return text;
    console.log('[AnalystFEN] FEN evidence included:', (text.match(/^fen\s*:/gim) || []).length);
    console.log('[AnalystFEN] Prompt includes FEN reading guide: true');
    return `${ANALYST_FEN_READING_GUIDE}\n\n${ANALYST_CAUSAL_EXPLANATION_GUIDE}\n\nCurrent Game Evidence:\n${text}`;
}

// Create Game instances
let createBoardObj = null;
let createGameInstance = null;

// Chess Coach instances
let coachBoard = null;
let coachGame = null;
let coachHistory = [];
let coachCurrentMoveIndex = -1;

// DOM Elements
const homeView = document.getElementById('homeView');
const winnerGroupView = document.getElementById('winnerGroupView');
const analysisView = document.getElementById('analysisView');
const createGameView = document.getElementById('createGameView');
const btnCreateGame = document.getElementById('btnCreateGame');
const btnProfileMenu = document.getElementById('btnProfileMenu');
const profileDropdown = document.getElementById('profileDropdown');
const profileConnectionStatus = document.getElementById('profileConnectionStatus');
const btnCoachMenu = document.getElementById('btnCoachMenu');
const coachDropdown = document.getElementById('coachDropdown');
const btnNewGameMenu = document.getElementById('btnNewGameMenu');
const newGameDropdown = document.getElementById('newGameDropdown');
const btnUploadGameMenu = document.getElementById('btnUploadGameMenu');
const btnBackFromCreate = document.getElementById('btnBackFromCreate');
const btnBackFromWinnerGroup = document.getElementById('btnBackFromWinnerGroup');
const btnUndoCreateMove = document.getElementById('btnUndoCreateMove');
const btnSaveCreateGame = document.getElementById('btnSaveCreateGame');
const createMoveList = document.getElementById('createMoveList');
const playComputerView = document.getElementById('playComputerView');
const btnPlayComputer = document.getElementById('btnPlayComputer');
const btnBackFromPlay = document.getElementById('btnBackFromPlay');
const trainingCoachView = document.getElementById('trainingCoachView');
const btnTrainingCoach = document.getElementById('btnTrainingCoach');
const btnBackFromTraining = document.getElementById('btnBackFromTraining');

// Chess Coach Elements
const chessCoachView = document.getElementById('chessCoachView');
const btnChessCoach = document.getElementById('btnChessCoach');
const btnBackFromCoach = document.getElementById('btnBackFromCoach');
const coachChatInput = document.getElementById('coachChatInput');
const sendCoachBtn = document.getElementById('sendCoachBtn');
const coachChatMessages = document.getElementById('coachChatMessages');
const foundVariations = document.getElementById('foundVariations');
const variationCount = document.getElementById('variationCount');
const coachMoveList = document.getElementById('coachMoveList');

const saveGameModal = document.getElementById('saveGameModal');
const btnCancelSave = document.getElementById('btnCancelSave');
const btnConfirmSave = document.getElementById('btnConfirmSave');
const sgEvent = document.getElementById('sgEvent');
const sgWhite = document.getElementById('sgWhite');
const sgBlack = document.getElementById('sgBlack');
const sgWinner = document.getElementById('sgWinner');
const gameLibrary = document.getElementById('gameLibrary');
const winnerGroupLibrary = document.getElementById('winnerGroupLibrary');
const winnerGroupTitle = document.getElementById('winnerGroupTitle');
const pgnInput = document.getElementById('pgnInput');
const moveListContainer = document.getElementById('moveList');
const btnBack = document.getElementById('btnBack');
const analysisTitle = document.getElementById('analysisTitle');
const rawPgnText = document.getElementById('rawPgnText');
const aiTextFormat = document.getElementById('aiTextFormat');

const sortBtn = document.getElementById('sortBtn');
const sortDropdown = document.getElementById('sortDropdown');
const currentSortLabel = document.getElementById('currentSortLabel');
const dashboardHome = document.getElementById('dashboardHome');
const fullGameLibrarySection = document.getElementById('fullGameLibrarySection');
const dashboardUsername = document.getElementById('dashboardUsername');
const btnHideGameLibrary = document.getElementById('btnHideGameLibrary');

const btnStart = document.getElementById('btnStart');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnEnd = document.getElementById('btnEnd');

// --- Chess Skill Level System ---
const SKILL_LEVEL_KEY = 'chessSkillLevel';
let _awaitingSkillLevel = false;
let _lastCoachAnswer = null;

function getChessSkillLevel() { return localStorage.getItem(SKILL_LEVEL_KEY); }
function setChessSkillLevel(level) {
    localStorage.setItem(SKILL_LEVEL_KEY, level);
    console.log(`[SkillLevel] Saved: ${level}`);
}

function parseSkillLevelInput(input) {
    const n = input.trim().toLowerCase();
    if (n === '1' || n === 'beginner') return 'beginner';
    if (n === '2' || n === 'intermediate') return 'intermediate';
    if (n === '3' || n === 'advanced') return 'advanced';
    const match = n.match(/i(?:'m|\s+am)\s+(?:an?\s+)?(beginner|intermediate|advanced)/);
    if (match) return match[1];
    return null;
}

function detectNaturalLevelChange(msg) {
    const m = msg.trim().toLowerCase();
    const s = m.match(/set\s+(?:my\s+)?level\s+(?:to\s+)?(beginner|intermediate|advanced)/);
    if (s) return s[1];
    if (/change\s+(?:my\s+)?level|reset\s+(?:my\s+)?level|^set\s+level$/.test(m)) return 'reset';
    return null;
}

function detectSimplifyOrDeepen(msg) {
    const m = msg.trim().toLowerCase();
    if (/explain\s*simpler|make\s*(?:it\s*)?simpler|simplify|eli5/.test(m)) return 'simpler';
    if (/go\s*deeper|more\s*detail|elaborate|explain\s*more/.test(m)) return 'deeper';
    return null;
}

function getSkillLevelConfirmation(level) {
    const msgs = {
        beginner: "Alright! I'll keep explanations simple and clear. Let's get started.",
        intermediate: "Alright! I'll explain things at an intermediate level. Let's get started.",
        advanced: "Alright! I'll include deeper strategy, theory, and variations. Let's get started."
    };
    return msgs[level] || msgs['intermediate'];
}

function updateSkillLevelBadge() {
    const level = getChessSkillLevel();
    let badge = document.getElementById('proficiency-badge');
    const header = document.querySelector('#chessCoachView .chat-header h3');
    if (!header) return;
    if (!level) { if (badge) badge.remove(); return; }
    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'proficiency-badge';
        badge.title = 'Click to change level';
        badge.addEventListener('click', () => { coachChatInput.value = 'change my level'; sendCoachMessage(); });
        header.appendChild(badge);
    }
    badge.className = `proficiency-badge ${level}`;
    badge.innerText = level.charAt(0).toUpperCase() + level.slice(1);
}

const SKILL_LEVEL_ASK_MSG = "What's your chess skill level? Choose one: beginner, intermediate, or advanced.";

function triggerSkillLevelOnboarding() {
    if (!getChessSkillLevel() && !_awaitingSkillLevel) {
        _awaitingSkillLevel = true;
        setTimeout(() => { addCoachMessage(SKILL_LEVEL_ASK_MSG, 'assistant'); }, 400);
    }
}

// Initialize the board UI
function initBoard() {
    const config = {
        draggable: false, // The board is for display only
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    };
    board = Chessboard('board', config);
    game = new Chess();
    updateNavigationButtons();
}

// --- View Management ---

const APP_ROUTES = Object.freeze({
    HOME: '/',
    PROFILE: '/profile',
    TRAINING: '/training',
    OPENINGS: '/openings',
    PLAY_COMPUTER: '/play-computer',
    CREATE_GAME: '/create-game'
});

let isApplyingAppRoute = false;

function normalizeAppPath(path = window.location.pathname) {
    const normalizedPath = `/${String(path || '').replace(/^\/+/, '')}`.replace(/\/+$/, '');
    return normalizedPath === '' ? '/' : normalizedPath;
}

function parseAppRoute(pathname = window.location.pathname) {
    const path = normalizeAppPath(pathname);
    const parts = path.split('/').filter(Boolean).map(part => decodeURIComponent(part));

    if (parts.length === 0) return { name: 'home' };
    if (parts[0] === 'profile') return { name: 'profile' };
    if (parts[0] === 'training') return { name: 'training' };
    if (parts[0] === 'openings') return { name: 'openings' };
    if (parts[0] === 'play-computer') return { name: 'playComputer' };
    if (parts[0] === 'create-game') return { name: 'createGame' };
    if (parts[0] === 'game' && parts[1]) {
        return {
            name: parts[2] === 'edit' ? 'editGame' : 'game',
            gameId: parts[1]
        };
    }

    return { name: 'notFound' };
}

function navigateToRoute(path, options = {}) {
    const nextPath = normalizeAppPath(path || '/');
    const currentPath = normalizeAppPath();
    if (currentPath !== nextPath) {
        const historyMethod = options.replace ? 'replaceState' : 'pushState';
        window.history[historyMethod]({}, '', nextPath);
    }
    applyAppRoute();
}

window.navigateToRoute = navigateToRoute;

async function renderAppRoute() {
    if (isApplyingAppRoute) return;
    isApplyingAppRoute = true;
    const route = parseAppRoute();
    try {
        if (route.name === 'profile') {
            showProfileView();
        } else if (route.name === 'training') {
            showTrainingCoachView();
        } else if (route.name === 'openings') {
            showChessCoachView();
        } else if (route.name === 'playComputer') {
            showPlayComputerRoute();
        } else if (route.name === 'createGame') {
            showCreateGameView();
        } else if (route.name === 'game' || route.name === 'editGame') {
            await showGameRoute(route.gameId, route.name === 'editGame');
        } else if (route.name === 'home') {
            showHomeView();
        } else {
            showRouteNotFoundView();
        }
    } finally {
        isApplyingAppRoute = false;
    }
}

async function applyAppRoute() {
    await renderAppRoute();
}

function getSameOriginRouteFromClick(event) {
    const routeLink = event.target.closest && event.target.closest('a[data-route], a[href^="/"]');
    if (!routeLink) return null;
    if (routeLink.target && routeLink.target !== '_self') return null;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return null;

    const rawRoute = routeLink.getAttribute('data-route') || routeLink.getAttribute('href');
    if (!rawRoute || rawRoute.startsWith('#')) return null;
    const url = new URL(rawRoute, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
}

document.addEventListener('click', (event) => {
    const routePath = getSameOriginRouteFromClick(event);
    if (!routePath) return;
    event.preventDefault();
    navigateToRoute(routePath);
}, true);

function showHomeView() {
    activeWinnerGroupCategory = null;
    currentLoadedGame = null;
    homeView.style.display = 'block';
    if (winnerGroupView) winnerGroupView.style.display = 'none';
    analysisView.style.display = 'none';
    createGameView.style.display = 'none';
    playComputerView.style.display = 'none';
    if (trainingCoachView) trainingCoachView.style.display = 'none';
    chessCoachView.style.display = 'none';
    const profileView = document.getElementById('profileView');
    if (profileView) profileView.style.display = 'none';
    renderGameLibrary();
}

function showCreateGameView() {
    homeView.style.display = 'none';
    if (winnerGroupView) winnerGroupView.style.display = 'none';
    analysisView.style.display = 'none';
    playComputerView.style.display = 'none';
    if (trainingCoachView) trainingCoachView.style.display = 'none';
    chessCoachView.style.display = 'none';
    const profileView = document.getElementById('profileView');
    if (profileView) profileView.style.display = 'none';
    createGameView.style.display = 'block';
    
    initCreateBoard();
}

async function showAnalysisView(savedGame = null) {
    setAnalysisLoading(savedGame);
    currentLoadedGame = savedGame ? await hydrateGameForRuntime(savedGame) : null;
    homeView.style.display = 'none';
    if (winnerGroupView) winnerGroupView.style.display = 'none';
    createGameView.style.display = 'none';
    playComputerView.style.display = 'none';
    if (trainingCoachView) trainingCoachView.style.display = 'none';
    chessCoachView.style.display = 'none';
    const profileView = document.getElementById('profileView');
    if (profileView) profileView.style.display = 'none';
    analysisView.style.display = 'block';
    
    if (currentLoadedGame) {
        analysisTitle.innerText = getGameTitle(currentLoadedGame);
        if (currentLoadedGame.hydrationError || !(currentLoadedGame.pgn || currentLoadedGame.rawPGN)) {
            showGameRestoreError(currentLoadedGame);
        } else {
            loadPGN(currentLoadedGame.pgn || currentLoadedGame.rawPGN, false, currentLoadedGame.aiTextFormat);
        }
    } else {
        analysisTitle.innerText = 'Chess Analysis';
    }
    
    // Ensure board is initialized and resized
    if (!board) initBoard();
    board.resize();
}

function showGameNotFoundView(gameId) {
    currentLoadedGame = null;
    homeView.style.display = 'none';
    if (winnerGroupView) winnerGroupView.style.display = 'none';
    createGameView.style.display = 'none';
    playComputerView.style.display = 'none';
    if (trainingCoachView) trainingCoachView.style.display = 'none';
    chessCoachView.style.display = 'none';
    const profileView = document.getElementById('profileView');
    if (profileView) profileView.style.display = 'none';
    analysisView.style.display = 'block';

    analysisTitle.innerText = 'Game not found';
    game = new Chess();
    if (!board) initBoard();
    if (board) {
        board.position('start');
        board.resize();
    }
    if (rawPgnText) rawPgnText.value = '';
    if (aiTextFormat) aiTextFormat.value = '';
    if (moveListContainer) {
        moveListContainer.innerHTML = `<div class="empty-state error-text">We could not find a saved game with ID "${gameId}".</div>`;
    }
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '<div class="message assistant">This saved game is missing or was deleted. Head back to the library and choose another game.</div>';
    }
}

function showRouteNotFoundView() {
    currentLoadedGame = null;
    homeView.style.display = 'none';
    if (winnerGroupView) winnerGroupView.style.display = 'none';
    createGameView.style.display = 'none';
    playComputerView.style.display = 'none';
    if (trainingCoachView) trainingCoachView.style.display = 'none';
    chessCoachView.style.display = 'none';
    const profileView = document.getElementById('profileView');
    if (profileView) profileView.style.display = 'none';
    analysisView.style.display = 'block';

    analysisTitle.innerText = 'Page not found';
    if (moveListContainer) {
        moveListContainer.innerHTML = '<div class="empty-state error-text">This page does not exist.</div>';
    }
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '<div class="message assistant">Use the main navigation to get back to your chess tools.</div>';
    }
}

function setAnalysisLoading(savedGame) {
    analysisTitle.innerText = savedGame ? `Loading ${getGameTitle(savedGame)}...` : 'Loading game...';
    if (moveListContainer) {
        moveListContainer.innerHTML = '<div class="empty-state">Loading game...</div>';
    }
}

function showGameRestoreError(gameRecord) {
    console.error('[GameCompression] This game could not be restored.', {
        id: gameRecord && gameRecord.id,
        title: gameRecord && (gameRecord.title || gameRecord.name),
        storageMode: gameRecord && gameRecord.storageMode,
        error: gameRecord && gameRecord.hydrationError
    });
    game = new Chess();
    if (!board) initBoard();
    if (board) board.position('start');
    if (rawPgnText) rawPgnText.value = '';
    if (aiTextFormat) aiTextFormat.value = '';
    if (moveListContainer) {
        moveListContainer.innerHTML = '<div class="empty-state error-text">This game could not be restored.</div>';
    }
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '<div class="message assistant">This game could not be restored. The compressed data may be corrupted.</div>';
    }
}

function showChessCoachView() {
    homeView.style.display = 'none';
    if (winnerGroupView) winnerGroupView.style.display = 'none';
    analysisView.style.display = 'none';
    createGameView.style.display = 'none';
    playComputerView.style.display = 'none';
    if (trainingCoachView) trainingCoachView.style.display = 'none';
    chessCoachView.style.display = 'block';
    const profileView = document.getElementById('profileView');
    if (profileView) profileView.style.display = 'none';
    
    if (!coachBoard) initCoachBoard();
    coachBoard.resize();
    updateSkillLevelBadge();
    triggerSkillLevelOnboarding();
}

function showTrainingCoachView() {
    homeView.style.display = 'none';
    if (winnerGroupView) winnerGroupView.style.display = 'none';
    analysisView.style.display = 'none';
    createGameView.style.display = 'none';
    playComputerView.style.display = 'none';
    chessCoachView.style.display = 'none';
    const profileView = document.getElementById('profileView');
    if (profileView) profileView.style.display = 'none';
    if (trainingCoachView) trainingCoachView.style.display = 'block';
    if (window.trainingCoachUI && typeof window.trainingCoachUI.open === 'function') {
        window.trainingCoachUI.open();
    }
}

function showPlayComputerRoute() {
    homeView.style.display = 'none';
    if (winnerGroupView) winnerGroupView.style.display = 'none';
    analysisView.style.display = 'none';
    createGameView.style.display = 'none';
    if (trainingCoachView) trainingCoachView.style.display = 'none';
    chessCoachView.style.display = 'none';
    const profileView = document.getElementById('profileView');
    if (profileView) profileView.style.display = 'none';
    playComputerView.style.display = 'block';
    if (window.playComputer && typeof window.playComputer.showSetup === 'function' && !window.playComputer.board) {
        window.playComputer.showSetup();
    }
}

async function showGameRoute(gameId, editMode = false) {
    const gameRecord = savedGames.find(g => String(g.id) === String(gameId));
    if (!gameRecord) {
        showGameNotFoundView(gameId);
        return;
    }
    await loadGameIntoAnalysis(gameRecord);
    if (editMode && moveListContainer) {
        const editNotice = document.createElement('div');
        editNotice.className = 'empty-state';
        editNotice.innerText = 'Edit mode opened for this saved game. Existing analysis tools are available here.';
        moveListContainer.prepend(editNotice);
    }
}

btnBack.addEventListener('click', () => navigateToRoute(APP_ROUTES.HOME));
if (btnBackFromWinnerGroup) btnBackFromWinnerGroup.addEventListener('click', () => navigateToRoute(APP_ROUTES.HOME));
btnBackFromCreate.addEventListener('click', () => navigateToRoute(APP_ROUTES.HOME));
btnBackFromPlay.addEventListener('click', () => navigateToRoute(APP_ROUTES.HOME));
if (btnBackFromTraining) btnBackFromTraining.addEventListener('click', () => navigateToRoute(APP_ROUTES.HOME));
btnBackFromCoach.addEventListener('click', () => navigateToRoute(APP_ROUTES.HOME));
btnCreateGame.addEventListener('click', () => navigateToRoute(APP_ROUTES.CREATE_GAME));
btnChessCoach.addEventListener('click', () => navigateToRoute(APP_ROUTES.OPENINGS));
if (btnTrainingCoach) {
    btnTrainingCoach.addEventListener('click', () => navigateToRoute(APP_ROUTES.TRAINING));
}
if (profileDropdown) {
    profileDropdown.addEventListener('click', (event) => {
        const item = event.target.closest('[data-profile-action]');
        if (!item) return;
        event.preventDefault();
        handleProfileMenuAction(item.dataset.profileAction);
    });
}

const navigationDropdowns = [
    { menu: document.getElementById('profileMenu'), trigger: btnProfileMenu, dropdown: profileDropdown, onOpen: renderProfileMenuState },
    { menu: document.getElementById('coachMenu'), trigger: btnCoachMenu, dropdown: coachDropdown },
    { menu: document.getElementById('newGameMenu'), trigger: btnNewGameMenu, dropdown: newGameDropdown }
].filter(({ menu, trigger, dropdown }) => menu && trigger && dropdown);

function setNavigationDropdownOpen(nav, isOpen) {
    nav.menu.classList.toggle('is-open', isOpen);
    nav.trigger.setAttribute('aria-expanded', String(isOpen));
    if (isOpen && typeof nav.onOpen === 'function') nav.onOpen();
}

function closeNavigationDropdowns(exceptNav = null) {
    navigationDropdowns.forEach(nav => {
        if (nav !== exceptNav) setNavigationDropdownOpen(nav, false);
    });
}

function toggleNavigationDropdown(nav) {
    const willOpen = !nav.menu.classList.contains('is-open');
    closeNavigationDropdowns(nav);
    setNavigationDropdownOpen(nav, willOpen);
}

navigationDropdowns.forEach(nav => {
    nav.trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleNavigationDropdown(nav);
    });

    nav.trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleNavigationDropdown(nav);
        }
        if (event.key === 'Escape') {
            setNavigationDropdownOpen(nav, false);
            nav.trigger.focus();
        }
    });

    nav.dropdown.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setNavigationDropdownOpen(nav, false);
            nav.trigger.focus();
        }
    });
});

if (coachDropdown) {
    coachDropdown.addEventListener('click', () => closeNavigationDropdowns());
}
if (newGameDropdown) {
    newGameDropdown.addEventListener('click', (event) => {
        if (event.target.closest('#btnUploadGameMenu')) return;
        closeNavigationDropdowns();
    });
}
if (btnUploadGameMenu && pgnInput) {
    btnUploadGameMenu.addEventListener('click', (event) => {
        event.preventDefault();
        closeNavigationDropdowns();
        pgnInput.click();
    });
}

if (dashboardHome) {
    dashboardHome.addEventListener('click', async (event) => {
        const gameRow = event.target.closest('[data-dashboard-game-id]');
        if (gameRow) {
            const gameId = gameRow.dataset.dashboardGameId;
            const gameRecord = savedGames.find(g => String(g.id) === String(gameId));
            if (gameRecord) await openGameFromLibrary(gameRecord);
            return;
        }

        const actionTarget = event.target.closest('[data-dashboard-action]');
        if (!actionTarget) return;
        const action = actionTarget.dataset.dashboardAction;

        if (action === 'training') {
            navigateToRoute(APP_ROUTES.TRAINING);
        } else if (action === 'coach') {
            navigateToRoute(APP_ROUTES.OPENINGS);
        } else if (action === 'show-library') {
            showDashboardGameLibrary();
        } else if (action === 'manage-chesscom') {
            openChessComSyncModal();
        }
    });

    dashboardHome.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const actionCard = event.target.closest('.dashboard-action-card[data-dashboard-action]');
        if (!actionCard) return;
        event.preventDefault();
        actionCard.click();
    });
}

if (btnHideGameLibrary) {
    btnHideGameLibrary.addEventListener('click', () => hideDashboardGameLibrary());
}

// --- Profile Page Integration ---
const btnBackFromProfile = document.getElementById('btnBackFromProfile');
const btnEditUsername = document.getElementById('btnEditUsername');
const btnSaveUsername = document.getElementById('btnSaveUsername');
const btnCancelEditUsername = document.getElementById('btnCancelEditUsername');
const inputLocalUsername = document.getElementById('inputLocalUsername');
const profileDisplayName = document.getElementById('profileDisplayName');
const profileAvatarContainer = document.getElementById('profileAvatarContainer');
const profileAvatarPiece = document.getElementById('profileAvatarPiece');

const avatarModal = document.getElementById('avatarModal');
const btnCancelAvatar = document.getElementById('btnCancelAvatar');
const btnConfirmAvatar = document.getElementById('btnConfirmAvatar');

let selectedAvatarPiece = '♔';
let selectedAvatarTheme = 'gold';

// Show Profile View
function showProfileView() {
    activeWinnerGroupCategory = null;
    currentLoadedGame = null;
    
    homeView.style.display = 'none';
    if (winnerGroupView) winnerGroupView.style.display = 'none';
    analysisView.style.display = 'none';
    createGameView.style.display = 'none';
    playComputerView.style.display = 'none';
    if (trainingCoachView) trainingCoachView.style.display = 'none';
    chessCoachView.style.display = 'none';
    
    const profileView = document.getElementById('profileView');
    if (profileView) profileView.style.display = 'block';
    
    renderProfilePage();
}

// Helper to determine user color in a game
function getUserColorInGame(g, chessComUsername, localUsername) {
    if (g.userColor) return g.userColor.toLowerCase();
    if (g.gameMetadata && g.gameMetadata.userColor) return g.gameMetadata.userColor.toLowerCase();
    if (g.chessCom && g.chessCom.userColor) return g.chessCom.userColor.toLowerCase();
    
    const white = ((g.headers && (g.headers.White || g.headers.white)) || g.white || '').trim().toLowerCase();
    const black = ((g.headers && (g.headers.Black || g.headers.black)) || g.black || '').trim().toLowerCase();
    
    const normalizedChessCom = String(chessComUsername || '').trim().toLowerCase();
    const normalizedLocal = String(localUsername || '').trim().toLowerCase();
    
    if (normalizedChessCom) {
        if (white === normalizedChessCom) return 'white';
        if (black === normalizedChessCom) return 'black';
    }
    if (normalizedLocal) {
        if (white === normalizedLocal) return 'white';
        if (black === normalizedLocal) return 'black';
    }
    
    // Check if one of them is computer/stockfish
    if (white.includes('stockfish') || white.includes('computer')) return 'black';
    if (black.includes('stockfish') || black.includes('computer')) return 'white';
    
    return null;
}

// Render Profile Data and Stats
function renderProfilePage() {
    // 1. Identity & Customize Elements
    const activeProfile = getActiveProfile();
    const localUsername = localStorage.getItem('chess_profile_username') || activeProfile.displayName || 'Chess Player';
    const chessComUsername = getChessComUsername();
    
    const avatarPiece = localStorage.getItem('chess_profile_avatar_piece') || '♔';
    const avatarTheme = localStorage.getItem('chess_profile_avatar_theme') || 'gold';
    
    selectedAvatarPiece = avatarPiece;
    selectedAvatarTheme = avatarTheme;
    
    if (profileDisplayName) profileDisplayName.innerText = localUsername;
    if (profileAvatarPiece) {
        if (activeProfile.avatarUrl) {
            profileAvatarPiece.innerHTML = `<img src="${escapeHtml(activeProfile.avatarUrl)}" alt="${escapeHtml(chessComUsername || localUsername)} avatar" class="profile-avatar-image">`;
            profileAvatarPiece.className = `profile-avatar gradient-${avatarTheme}`;
        } else {
            profileAvatarPiece.innerText = avatarPiece;
            profileAvatarPiece.className = `profile-avatar gradient-${avatarTheme}`;
        }
    }
    
    const badgeEl = document.getElementById('profileChessComBadge');
    const chessComTextEl = document.getElementById('profileChessComUsernameText');
    if (chessComTextEl) {
        if (chessComUsername) {
            chessComTextEl.innerText = `@${chessComUsername}`;
            if (badgeEl) badgeEl.className = 'chesscom-badge connected';
        } else {
            chessComTextEl.innerText = 'No Chess.com account connected';
            if (badgeEl) badgeEl.className = 'chesscom-badge';
        }
    }
    
    // 2. Training progress (Level, XP)
    const trainingProgress = getSharedTrainingProgress();
    const totalXp = trainingProgress.totalXp;
    const level = trainingProgress.level;
    const progressXp = trainingProgress.progressXp;
    const progressPercent = trainingProgress.progressPercent;
    
    const levelValEl = document.getElementById('profileLevelVal');
    const xpBarFillEl = document.getElementById('profileXpBarFill');
    const xpTextEl = document.getElementById('profileXpText');
    const xpNextLevelTextEl = document.getElementById('profileXpNextLevelText');
    const totalXpDisplayEl = document.getElementById('profileTotalXpDisplay');
    const trainingCurrentLevelEl = document.getElementById('trainingCurrentLevelVal');
    const profileLevelStatEl = document.getElementById('profileLevelStat');
    const profileTotalXpEl = document.getElementById('profileTotalXp');

    if (levelValEl) levelValEl.innerText = level;
    if (profileLevelStatEl) profileLevelStatEl.innerText = level;
    if (trainingCurrentLevelEl) trainingCurrentLevelEl.innerText = level;
    if (profileTotalXpEl) profileTotalXpEl.innerText = totalXp.toLocaleString();
    if (totalXpDisplayEl) totalXpDisplayEl.innerText = totalXp.toLocaleString();
    if (xpBarFillEl) xpBarFillEl.style.width = `${progressPercent}%`;
    if (xpTextEl) xpTextEl.innerText = `${totalXp.toLocaleString()} XP`;
    if (xpNextLevelTextEl) {
        xpNextLevelTextEl.innerText = trainingProgress.lockedBossLevel
            ? 'Boss challenge required'
            : `${TRAINING_XP_PER_LEVEL - progressXp} XP to Level ${level + 1}`;
    }
    
    // 3. Game Statistics Calculations
    let totalGames = 0;
    let won = 0;
    let lost = 0;
    let drawn = 0;
    
    if (Array.isArray(savedGames)) {
        savedGames.forEach(g => {
            const userColor = getUserColorInGame(g, chessComUsername, localUsername) || 'white'; // Default to white to include outcomes
            const result = getGameResult(g);
            totalGames++;
            
            if (result === '1/2-1/2' || result.includes('1/2')) {
                drawn++;
            } else if (result === '1-0') {
                if (userColor === 'white') won++;
                else lost++;
            } else if (result === '0-1') {
                if (userColor === 'black') won++;
                else lost++;
            } else {
                // Ongoing or unknown result, count as drawn
                drawn++;
            }
        });
    }
    
    const winRate = totalGames > 0 ? Math.round((won / totalGames) * 100) : 0;
    updateActiveProfileProgress(profile => ({
        ...profile,
        gameStats: { total: totalGames, won, lost, drawn, winRate }
    }));
    
    // Update Stats UI
    const totalGamesEl = document.getElementById('profileTotalGames');
    const gamesWonEl = document.getElementById('profileGamesWon');
    const gamesLostEl = document.getElementById('profileGamesLost');
    const gamesDrawnEl = document.getElementById('profileGamesDrawn');
    const winRateEl = document.getElementById('profileWinRate');
    
    if (totalGamesEl) totalGamesEl.innerText = totalGames;
    if (gamesWonEl) gamesWonEl.innerText = won;
    if (gamesLostEl) gamesLostEl.innerText = lost;
    if (gamesDrawnEl) gamesDrawnEl.innerText = drawn;
    if (winRateEl) winRateEl.innerText = `${winRate}%`;
    
    // 4. Training stats (solved count, streak)
    let puzzlesSolved = Math.max(0, Math.floor(Number(activeProfile.puzzlesSolved || 0) || 0));
    let currentStreak = Number(activeProfile.streak || 0);
    let bestStreak = 0;
    let bossesDefeated = {};
    let lastPlayedAt = null;
    
    try {
        const playerProfile = activeProfile.trainingPlayerProfile || {};
        if (playerProfile) {
            puzzlesSolved = activeProfile.puzzlesSolved || (playerProfile.completedPuzzleIds && playerProfile.completedPuzzleIds.length) || playerProfile.totalPuzzlesSolved || playerProfile.totalCorrect || 0;
            bestStreak = playerProfile.bestOverallStreak || 0;
            bossesDefeated = playerProfile.bossesDefeated || {};
            lastPlayedAt = playerProfile.lastPlayedAt;
        }
    } catch (e) {
        console.warn('Failed to parse training player profile:', e);
    }
    
    const puzzlesSolvedEl = document.getElementById('profilePuzzlesSolved');
    const gamesAnalyzedEl = document.getElementById('profileGamesAnalyzed');
    const estimatedRatingEl = document.getElementById('profileEstimatedRating');
    const currentStreakValEl = document.getElementById('profileCurrentStreakVal');
    const bestStreakEl = document.getElementById('profileBestStreak');
    
    if (puzzlesSolvedEl) puzzlesSolvedEl.innerText = puzzlesSolved;
    if (gamesAnalyzedEl) gamesAnalyzedEl.innerText = Math.max(0, Math.floor(Number(activeProfile.gamesAnalyzed || 0) || 0));
    if (estimatedRatingEl) {
        const estimatedRating = Math.max(0, Math.floor(Number(activeProfile.estimatedRating || 0) || 0));
        estimatedRatingEl.innerText = estimatedRating ? estimatedRating.toLocaleString() : 'Not estimated';
    }
    if (currentStreakValEl) currentStreakValEl.innerText = currentStreak;
    if (bestStreakEl) bestStreakEl.innerText = bestStreak;
    
    // 5. Recent Training Activity Timeline
    const recentActivityEl = document.getElementById('profileRecentActivity');
    if (recentActivityEl) {
        recentActivityEl.innerHTML = '';
        const timelineEvents = [];
        
        // Add last active event
        if (lastPlayedAt) {
            const dateStr = new Date(lastPlayedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            timelineEvents.push({
                text: 'Completed a puzzle training session',
                time: dateStr,
                timestamp: new Date(lastPlayedAt).getTime()
            });
        }
        
        // Add boss defeat events
        const bossNames = {
            '3': 'Tactics Goblin (Level 3 Boss)',
            '6': 'Endgame Titan (Level 6 Boss)',
            '9': 'Calculation Demon (Level 9 Boss)',
            '12': 'Defensive Fortress (Level 12 Boss)',
            '15': 'Fork Master (Level 15 Boss)',
            '18': 'Checkmate Dragon (Level 18 Boss)'
        };
        
        Object.keys(bossesDefeated).forEach(lvl => {
            if (bossesDefeated[lvl]) {
                const bossName = bossNames[lvl] || `Level ${lvl} Boss`;
                timelineEvents.push({
                    text: `🏆 Defeated ${bossName}!`,
                    time: 'Milestone Achievement',
                    timestamp: Number(lvl) * 1000
                });
            }
        });
        
        // Sort events
        timelineEvents.sort((a, b) => b.timestamp - a.timestamp);
        
        if (timelineEvents.length === 0) {
            recentActivityEl.innerHTML = '<div class="timeline-empty-state">No training activity yet. Play in Training Coach to start earning XP!</div>';
        } else {
            timelineEvents.forEach(ev => {
                const item = document.createElement('div');
                item.className = 'timeline-item';
                item.innerHTML = `
                    <div class="timeline-dot"></div>
                    <div class="timeline-info">
                        <span class="timeline-text">${ev.text}</span>
                        <span class="timeline-time">${ev.time}</span>
                    </div>
                `;
                recentActivityEl.appendChild(item);
            });
        }
    }
}

// Username editing handlers
if (btnEditUsername) {
    btnEditUsername.addEventListener('click', () => {
        const currentName = localStorage.getItem('chess_profile_username') || 'Chess Player';
        if (inputLocalUsername) inputLocalUsername.value = currentName;
        document.querySelector('.username-display-wrapper').style.display = 'none';
        document.querySelector('.username-edit-wrapper').style.display = 'flex';
        if (inputLocalUsername) inputLocalUsername.focus();
    });
}

if (btnSaveUsername) {
    btnSaveUsername.addEventListener('click', () => {
        if (inputLocalUsername) {
            const newName = inputLocalUsername.value.trim();
            if (newName) {
                localStorage.setItem('chess_profile_username', newName);
                if (profileDisplayName) profileDisplayName.innerText = newName;
            }
        }
        document.querySelector('.username-display-wrapper').style.display = 'flex';
        document.querySelector('.username-edit-wrapper').style.display = 'none';
        renderProfilePage();
    });
}

if (btnCancelEditUsername) {
    btnCancelEditUsername.addEventListener('click', () => {
        document.querySelector('.username-display-wrapper').style.display = 'flex';
        document.querySelector('.username-edit-wrapper').style.display = 'none';
    });
}

// Avatar selection handlers
if (profileAvatarContainer) {
    profileAvatarContainer.addEventListener('click', () => {
        const pieceOpts = document.querySelectorAll('#avatarPieceOptions .piece-opt');
        pieceOpts.forEach(opt => {
            if (opt.getAttribute('data-piece') === selectedAvatarPiece) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
        
        const themeOpts = document.querySelectorAll('#avatarThemeOptions .theme-opt');
        themeOpts.forEach(opt => {
            if (opt.getAttribute('data-theme') === selectedAvatarTheme) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
        
        if (avatarModal) avatarModal.style.display = 'flex';
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-menu')) {
        closeNavigationDropdowns();
    }

    if (e.target.classList.contains('piece-opt')) {
        const pieceOpts = document.querySelectorAll('#avatarPieceOptions .piece-opt');
        pieceOpts.forEach(opt => opt.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedAvatarPiece = e.target.getAttribute('data-piece');
    }
    
    if (e.target.classList.contains('theme-opt')) {
        const themeOpts = document.querySelectorAll('#avatarThemeOptions .theme-opt');
        themeOpts.forEach(opt => opt.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedAvatarTheme = e.target.getAttribute('data-theme');
    }
    
    const profileButton = e.target.closest('.btn-go-profile');
    if (profileButton) {
        e.preventDefault();
        navigateToRoute(APP_ROUTES.PROFILE);
    }
});

if (btnCancelAvatar) {
    btnCancelAvatar.addEventListener('click', () => {
        if (avatarModal) avatarModal.style.display = 'none';
    });
}

if (btnConfirmAvatar) {
    btnConfirmAvatar.addEventListener('click', () => {
        localStorage.setItem('chess_profile_avatar_piece', selectedAvatarPiece);
        localStorage.setItem('chess_profile_avatar_theme', selectedAvatarTheme);
        if (avatarModal) avatarModal.style.display = 'none';
        renderProfilePage();
    });
}

if (btnBackFromProfile) {
    btnBackFromProfile.addEventListener('click', () => navigateToRoute(APP_ROUTES.HOME));
}

// --- Chess Coach Board Logic ---
function initCoachBoard() {
    coachGame = new Chess();
    const config = {
        draggable: false,
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    };
    coachBoard = Chessboard('coachBoard', config);
    updateCoachNavigationButtons();
}

function updateCoachNavigationButtons() {
    const btnStart = document.getElementById('btnCoachStart');
    const btnPrev = document.getElementById('btnCoachPrev');
    const btnNext = document.getElementById('btnCoachNext');
    const btnEnd = document.getElementById('btnCoachEnd');
    
    if (!btnStart) return; // Not in coach view
    
    btnStart.disabled = coachCurrentMoveIndex === -1;
    btnPrev.disabled = coachCurrentMoveIndex === -1;
    btnNext.disabled = coachCurrentMoveIndex === coachHistory.length - 1 || coachHistory.length === 0;
    btnEnd.disabled = coachCurrentMoveIndex === coachHistory.length - 1 || coachHistory.length === 0;
}

function goCoachToMove(index) {
    if (index < -1 || index >= coachHistory.length) return;
    coachCurrentMoveIndex = index;
    
    if (coachCurrentMoveIndex === -1) {
        coachBoard.position('start');
    } else {
        coachBoard.position(coachHistory[coachCurrentMoveIndex].fen);
    }
    
    const allMoves = coachMoveList.querySelectorAll('.move-item');
    allMoves.forEach(m => m.classList.remove('active'));
    
    if (coachCurrentMoveIndex !== -1) {
        const activeMove = coachMoveList.querySelector(`.move-item[data-index="${coachCurrentMoveIndex}"]`);
        if (activeMove) {
            activeMove.classList.add('active');
            activeMove.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    
    updateCoachNavigationButtons();
}

document.getElementById('btnCoachStart').addEventListener('click', () => goCoachToMove(-1));
document.getElementById('btnCoachEnd').addEventListener('click', () => goCoachToMove(coachHistory.length - 1));
document.getElementById('btnCoachPrev').addEventListener('click', () => goCoachToMove(coachCurrentMoveIndex - 1));
document.getElementById('btnCoachNext').addEventListener('click', () => goCoachToMove(coachCurrentMoveIndex + 1));
// btnPlayComputer click is handled by PlayComputer class in playComputer.js

// --- Create Game Logic ---
function initCreateBoard() {
    createGameInstance = new Chess();
    
    const onDrop = function(source, target) {
        const move = createGameInstance.move({
            from: source,
            to: target,
            promotion: 'q' // NOTE: always promote to a queen for simplicity
        });

        if (move === null) return 'snapback';
        
        renderCreateMoveList();
    };

    const onSnapEnd = function() {
        createBoardObj.position(createGameInstance.fen());
    };

    const config = {
        draggable: true,
        position: 'start',
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    };
    
    createBoardObj = Chessboard('createBoard', config);
    renderCreateMoveList();
}

function renderCreateMoveList() {
    createMoveList.innerHTML = '';
    const history = createGameInstance.history();
    
    if (history.length === 0) {
        createMoveList.innerHTML = '<div class="empty-state">Make a move on the board to start.</div>';
        return;
    }
    
    let currentPair = null;
    for (let i = 0; i < history.length; i++) {
        if (i % 2 === 0) {
            currentPair = document.createElement('div');
            currentPair.className = 'move-pair';
            
            const moveNum = document.createElement('div');
            moveNum.className = 'move-number';
            moveNum.innerText = `${Math.floor(i / 2) + 1}.`;
            currentPair.appendChild(moveNum);
            
            createMoveList.appendChild(currentPair);
        }
        
        const moveItem = document.createElement('div');
        moveItem.className = 'move-item';
        moveItem.innerText = history[i];
        currentPair.appendChild(moveItem);
    }
    
    // Scroll to bottom
    createMoveList.scrollTop = createMoveList.scrollHeight;
}

// Create Game Logic
btnUndoCreateMove.addEventListener('click', () => {
    if (!createGameInstance) return;
    const move = createGameInstance.undo();
    if (move) {
        createBoardObj.position(createGameInstance.fen());
        renderCreateMoveList();
    }
});

// Save Modal Logic
btnSaveCreateGame.addEventListener('click', () => {
    if (!createGameInstance || createGameInstance.history().length === 0) {
        alert("No moves to save. Please make some moves on the board first.");
        return;
    }
    
    // Auto-detect winner
    let autoWinner = "Draw";
    const isCheckmate = createGameInstance.in_checkmate();
    const turn = createGameInstance.turn(); // 'w' or 'b'
    
    console.log("[DEV] Final position checkmate:", isCheckmate);
    console.log("[DEV] Side to move at final position:", turn);
    
    if (isCheckmate) {
        if (turn === 'b') {
            autoWinner = "White";
        } else {
            autoWinner = "Black";
        }
    }
    
    console.log("[DEV] Auto-detected winner:", autoWinner);
    
    sgWinner.value = autoWinner;
    
    sgEvent.value = '';
    sgWhite.value = '';
    sgBlack.value = '';
    saveGameModal.style.display = 'flex';
});

btnCancelSave.addEventListener('click', () => {
    saveGameModal.style.display = 'none';
});

btnConfirmSave.addEventListener('click', async () => {
    const eventName = sgEvent.value.trim() || 'Untitled Game';
    const whiteName = sgWhite.value.trim() || 'White';
    const blackName = sgBlack.value.trim() || 'Black';
    const selectedWinner = sgWinner.value;
    
    let resultString = "*";
    if (selectedWinner === "White") resultString = "1-0";
    else if (selectedWinner === "Black") resultString = "0-1";
    else if (selectedWinner === "Draw") resultString = "1/2-1/2";
    
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
    
    createGameInstance.header('Event', eventName);
    createGameInstance.header('Date', dateStr);
    createGameInstance.header('White', whiteName);
    createGameInstance.header('Black', blackName);
    createGameInstance.header('Result', resultString);
    
    const pgnText = createGameInstance.pgn();
    const newGame = await saveGameToStorage(pgnText);
    
    if (newGame) {
        saveGameModal.style.display = 'none';
        navigateToRoute('/');
    }
});

// --- PGN Converter & Storage Logic ---

function removeFenLines(text) {
    if (!text) return '';
    return text.replace(/\r\n/g, '\n').split('\n').filter(line => {
        return !line.trim().toLowerCase().startsWith('fen:');
    }).join('\n');
}

/** True if any half-move line is not immediately followed by a fen: line. */
function aiTextNeedsFenUpgrade(text) {
    if (!text || !text.trim()) return false;
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let inMoveSection = false;
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (/^\d+$/.test(t)) {
            inMoveSection = true;
            continue;
        }
        if (/^\d+\s*:\s*(white|black)\s*:/i.test(t)) {
            inMoveSection = true;
        }
        const hdr = t.match(/^(white|black)\s*:\s*(.+)$/i);
        if (!hdr) continue;
        const san = hdr[2].trim();
        if (!inMoveSection) {
            const probe = new Chess();
            if (!probe.move(san)) continue;
            inMoveSection = true;
        }
        const next = lines[i + 1];
        if (!next || !next.trim().toLowerCase().startsWith('fen:')) {
            return true;
        }
    }
    return false;
}

/**
 * Inserts/refreshes fen: lines after each half-move using chess.js. Input must be free of fen lines.
 * Preserves all non-fen lines (including blank lines and metadata). Returns null on parse/replay failure.
 */
function insertFenLinesIntoAiTextPreserving(baseText) {
    const normalized = removeFenLines((baseText || '').replace(/\r\n/g, '\n'));
    const lines = normalized.split('\n');
    const board = new Chess();
    const out = [];
    let i = 0;
    let inMoveSection = false;
    let expectWhite = true;
    let halfMoves = 0;

    while (i < lines.length) {
        const raw = lines[i];
        const t = raw.trim();

        const legacy = t.match(/^(\d+)\s*:\s*(white|black)\s*:\s*(.+)$/i);
        const sideMatch = !legacy && t.match(/^(white|black)\s*:\s*(.+)$/i);

        let isMoveLine = false;
        let san = null;
        let side = null;

        if (legacy) {
            inMoveSection = true;
            side = legacy[2].toLowerCase();
            san = legacy[3].trim();
            isMoveLine = true;
        } else if (sideMatch) {
            side = sideMatch[1].toLowerCase();
            san = sideMatch[2].trim();
            if (!inMoveSection) {
                const probe = new Chess();
                if (probe.move(san) === null) {
                    out.push(raw);
                    i++;
                    continue;
                }
                inMoveSection = true;
            }
            isMoveLine = true;
        }

        if (isMoveLine) {
            const isWhite = side === 'white';
            if (isWhite !== expectWhite) {
                console.warn(`[ChessTextFormat] Half-move side out of sequence (expected ${expectWhite ? 'white' : 'black'}).`);
                return null;
            }
            out.push(raw);
            if (board.move(san) === null) {
                console.warn(`[ChessTextFormat] Illegal move when inserting FEN: ${san}`);
                return null;
            }
            halfMoves++;
            out.push(`fen: ${board.fen()}`);
            expectWhite = !expectWhite;
            i++;
            continue;
        }

        if (/^\d+$/.test(t)) {
            inMoveSection = true;
            out.push(raw);
            i++;
            continue;
        }

        if (t.toLowerCase().startsWith('fen:')) {
            i++;
            continue;
        }

        out.push(raw);
        i++;
    }

    const newText = out.join('\n');
    if (removeFenLines(newText) !== normalized) {
        console.warn('[ChessTextFormat] FEN insert would alter non-FEN text; aborting.');
        return null;
    }

    return {
        newText,
        halfMoves,
        fensInserted: halfMoves,
        finalFen: board.fen()
    };
}

/** Adds only fen: lines; validates removeFenLines(newText) === removeFenLines(oldText). */
function upgradeAiTextFormatWithFens(storedAiText) {
    console.log('[ChessTextFormat] Adding FEN lines only');
    const oldText = (storedAiText || '').replace(/\r\n/g, '\n');
    const base = removeFenLines(oldText);
    const result = insertFenLinesIntoAiTextPreserving(base);
    if (!result) {
        console.warn('[ChessTextFormat] Original format preserved: false');
        return null;
    }
    const preserved = removeFenLines(result.newText) === base && base === removeFenLines(oldText);
    console.log(`[ChessTextFormat] Original format preserved: ${preserved}`);
    if (!preserved) {
        console.warn('[ChessTextFormat] FEN upgrade validation failed (removeFenLines mismatch).');
        return null;
    }
    console.log(`[ChessTextFormat] Half-moves found: ${result.halfMoves}`);
    console.log(`[ChessTextFormat] FEN lines inserted: ${result.fensInserted}`);
    console.log(`[ChessTextFormat] Final FEN: ${result.finalFen}`);
    return result.newText;
}

/**
 * Converts PGN to a custom AI text format.
 */
function convertPgnToAiTextFormat(pgn) {
    if (!pgn) return '';
    
    const tempGame = new Chess();
    if (!tempGame.load_pgn(pgn)) {
        console.error("[ChessTextFormat] Error: Failed to load PGN");
        return '';
    }

    const headers = tempGame.header();
    const history = tempGame.history({ verbose: true });
    
    // 1. Build Metadata section
    let aiText = "";
    const desiredHeaders = ["Event", "Site", "Date", "Round", "White", "Black", "Result"];
    desiredHeaders.forEach(h => {
        if (headers[h]) {
            aiText += `${h.toLowerCase()}: ${headers[h]}\n`;
        }
    });
    aiText += "\n";

    // 2. Build Move section
    const board = new Chess();
    let halfMoves = 0;
    let fenInserted = 0;

    for (let i = 0; i < history.length; i++) {
        const move = history[i];
        board.move(move);
        
        const moveNumber = Math.floor(i / 2) + 1;
        const side = (i % 2 === 0) ? 'white' : 'black';
        const moveSAN = move.san;
        const currentFen = board.fen();

        if (side === 'white') {
            aiText += `${moveNumber}\n`;
            aiText += `white: ${moveSAN}\n`;
            aiText += `fen: ${currentFen}\n`;
        } else {
            aiText += `black: ${moveSAN}\n`;
            aiText += `fen: ${currentFen}\n\n`;
        }
        
        halfMoves++;
        fenInserted++;
    }

    const out = aiText.trim();
    const roundTrip = insertFenLinesIntoAiTextPreserving(removeFenLines(out));
    const selfConsistent = roundTrip && roundTrip.newText === out;
    if (!selfConsistent) {
        console.warn('[ChessTextFormat] PGN output failed FEN round-trip self-check.');
    }
    console.log(`[ChessTextFormat] Original format preserved: ${selfConsistent}`);
    console.log(`[ChessTextFormat] Half-moves found: ${halfMoves}`);
    console.log(`[ChessTextFormat] FEN lines inserted: ${fenInserted}`);
    console.log(`[ChessTextFormat] Final FEN: ${board.fen()}`);

    return out;
}

async function fetchBackendGames() {
    const response = await fetch(`${STORAGE_API_BASE}/games`);
    if (!response.ok) throw new Error(`Filesystem game store returned ${response.status}`);
    const games = await response.json();
    return Array.isArray(games) ? games : [];
}

function limitLibraryGames(games) {
    return (Array.isArray(games) ? games : []).filter(Boolean).slice(0, LIBRARY_GAME_LIMIT);
}

async function saveSavedGamesToStorage(games) {
    const limitedGames = limitLibraryGames(games);
    const response = await fetch(`${STORAGE_API_BASE}/games/library`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ games: limitedGames })
    });

    if (!response.ok) {
        throw new Error(`Filesystem game store save failed with ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data.games)) {
        savedGames = data.games;
    }
    localStorage.removeItem('chess_saved_games');
    localStorage.removeItem('chess_saved_games_pending');
    return savedGames;
}

async function hydrateGameForRuntime(gameRecord) {
    if (window.gameCompressionService && typeof window.gameCompressionService.hydrateGameForRuntime === 'function') {
        return window.gameCompressionService.hydrateGameForRuntime(gameRecord);
    }
    const pgn = gameRecord && (gameRecord.pgn || gameRecord.rawPGN || '');
    return { ...gameRecord, storageMode: 'raw', pgn, rawPGN: pgn, compressed: null };
}

async function compressGameForStorage(gameRecord, options = {}) {
    if (window.gameCompressionService && typeof window.gameCompressionService.compressGameForStorage === 'function') {
        return window.gameCompressionService.compressGameForStorage(gameRecord, options);
    }
    return { ...gameRecord, storageMode: 'raw', pgn: gameRecord.pgn || gameRecord.rawPGN || '', compressed: null };
}

async function getGamePgnForExport(gameRecord = currentLoadedGame) {
    const runtimeGame = await hydrateGameForRuntime(gameRecord);
    return runtimeGame && !runtimeGame.hydrationError ? (runtimeGame.pgn || runtimeGame.rawPGN || '') : '';
}

window.hydrateGameForRuntime = hydrateGameForRuntime;
window.getGamePgnForExport = getGamePgnForExport;

async function loadSavedGames() {
    let backendAvailable = false;

    try {
        const filesystemGames = await fetchBackendGames();
        backendAvailable = true;
        fileStoreUnavailable = false;
        if (filesystemGames.length > 0) {
            savedGames = limitLibraryGames(filesystemGames);
            if (filesystemGames.length > LIBRARY_GAME_LIMIT) {
                await saveSavedGamesToStorage(savedGames);
            }
            localStorage.removeItem('chess_saved_games');
            localStorage.removeItem('chess_saved_games_pending');
            console.log(`[FileGameStore] Loaded ${savedGames.length} game(s) from local filesystem.`);
            return;
        }
    } catch (err) {
        fileStoreUnavailable = true;
        savedGames = [];
        console.warn('[FileGameStore] Backend filesystem store unavailable. Start it with: node backend/server.js', err);
        return;
    }

    if (!backendAvailable) return;

    const data = localStorage.getItem('chess_saved_games');
    let storedGames = [];
    try {
        storedGames = data ? JSON.parse(data) : [];
        if (!Array.isArray(storedGames)) storedGames = [];
    } catch (err) {
        console.error('[GameCompression] Failed to parse saved games from storage:', err);
        storedGames = [];
    }
    const migratedGames = [];
    let updated = false;

    for (const storedGame of storedGames) {
        let runtimeGame = await hydrateGameForRuntime(storedGame);

        if (!runtimeGame.hydrationError) {
            const pgn = runtimeGame.pgn || runtimeGame.rawPGN;

            if (!runtimeGame.aiTextFormat && pgn) {
                runtimeGame.aiTextFormat = convertPgnToAiTextFormat(pgn);
                updated = true;
            }

            if (runtimeGame.aiTextFormat && aiTextNeedsFenUpgrade(runtimeGame.aiTextFormat)) {
                const upgraded = upgradeAiTextFormatWithFens(runtimeGame.aiTextFormat);
                if (upgraded) {
                    runtimeGame.aiTextFormat = upgraded;
                    updated = true;
                }
            }
        }

        const storageGame = runtimeGame.hydrationError
            ? { ...storedGame }
            : await compressGameForStorage(runtimeGame);

        if (JSON.stringify(storageGame) !== JSON.stringify(storedGame)) {
            updated = true;
        }
        migratedGames.push(storageGame);
    }

    savedGames = migratedGames;

    if (savedGames.length > 0) {
        try {
            await saveSavedGamesToStorage(savedGames);
            console.log(`[FileGameStore] Migrated ${savedGames.length} browser-stored game(s) to backend/game-storage.`);
        } catch (err) {
            console.error('[FileGameStore] Could not migrate games to local filesystem:', err);
        }
    } else if (updated) {
        localStorage.removeItem('chess_saved_games');
        localStorage.removeItem('chess_saved_games_pending');
    }
}

function normalizeChessComUsername(username) {
    return String(username || '').trim().replace(/^@+/, '').toLowerCase();
}

const ACCOUNT_PROFILES_KEY = 'chess_account_profiles';
const ACTIVE_PROFILE_USERNAME_KEY = 'chess_active_profile_username';
const PROFILE_MIGRATION_KEY = 'chess_account_profiles_migrated_from_global';
const LOCAL_PROFILE_USERNAME = 'local';

function normalizeProfileUsername(username) {
    return normalizeChessComUsername(username) || LOCAL_PROFILE_USERNAME;
}

function readAccountProfiles() {
    const stored = readJsonStorage(ACCOUNT_PROFILES_KEY, {});
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

function saveAccountProfiles(profiles) {
    localStorage.setItem(ACCOUNT_PROFILES_KEY, JSON.stringify(profiles || {}));
}

function readGlobalTrainingProfile() {
    return readJsonStorage('training_player_profile', {}) || {};
}

function getCompletedPuzzleIdsFromTrainingProfile(trainingProfile = {}) {
    return Array.isArray(trainingProfile.completedPuzzleIds)
        ? Array.from(new Set(trainingProfile.completedPuzzleIds.map(id => String(id)).filter(Boolean)))
        : [];
}

function getPuzzlesSolvedFromProfileData(trainingProfile = {}, completedPuzzleIds = []) {
    return completedPuzzleIds.length
        || trainingToStoredCount(trainingProfile.totalPuzzlesSolved)
        || trainingToStoredCount(trainingProfile.totalCorrect);
}

function getCurrentLevelXpFromProfileData(trainingProfile = {}, totalXp = 0) {
    const currentLevelXp = Number(trainingProfile.currentLevelXp);
    if (Number.isFinite(currentLevelXp) && currentLevelXp >= 0) {
        return Math.max(0, Math.min(TRAINING_XP_PER_LEVEL - 1, Math.floor(currentLevelXp)));
    }
    return Math.max(0, Math.floor(Number(totalXp) || 0)) % TRAINING_XP_PER_LEVEL;
}

function getGamesAnalyzedFromWeaknessProfile(weaknessProfile) {
    if (!weaknessProfile || typeof weaknessProfile !== 'object') return 0;
    const weakness = weaknessProfile.weaknessProfile || weaknessProfile;
    if (Array.isArray(weakness.analyzedGameIds)) return weakness.analyzedGameIds.length;
    const profileData = weakness.profileData || weaknessProfile.profileData || {};
    return trainingToStoredCount(profileData.gamesAnalyzed || weakness.gamesAnalyzed || weaknessProfile.gamesAnalyzed);
}

function getEstimatedRatingFromWeaknessProfile(weaknessProfile) {
    if (!weaknessProfile || typeof weaknessProfile !== 'object') return 0;
    const weakness = weaknessProfile.weaknessProfile || weaknessProfile;
    const profileData = weakness.profileData || weaknessProfile.profileData || {};
    const range = profileData.puzzleRatingRange || weakness.puzzleRatingRange || {};
    return trainingToStoredCount(profileData.estimatedPuzzleRating || profileData.estimatedRating || weakness.estimatedRating || range.min);
}

function getWeaknessesFromWeaknessProfile(weaknessProfile) {
    if (!weaknessProfile || typeof weaknessProfile !== 'object') return [];
    const weakness = weaknessProfile.weaknessProfile || weaknessProfile;
    const rawWeaknesses = weakness.topWeaknesses || weakness.recommendedPuzzleThemes || weakness.weaknesses || [];
    return (Array.isArray(rawWeaknesses) ? rawWeaknesses : [])
        .map(item => typeof item === 'string' ? item : item && (item.theme || item.name || item.id))
        .map(item => String(item || '').trim())
        .filter(Boolean);
}

function createDefaultAccountProfile(username, options = {}) {
    const normalizedUsername = normalizeProfileUsername(username);
    const now = new Date().toISOString();
    const legacyTraining = options.trainingPlayerProfile || {};
    const legacyWeakness = options.weaknessProfile || null;
    const legacyActivity = Array.isArray(options.activityLog) ? options.activityLog : [];
    const totalXp = Math.max(0, Math.floor(Number(options.totalXp || legacyTraining.totalXp || 0) || 0));
    const currentLevelXp = getCurrentLevelXpFromProfileData(legacyTraining, totalXp);
    const completedPuzzleIds = getCompletedPuzzleIdsFromTrainingProfile(legacyTraining);
    const puzzlesSolved = trainingToStoredCount(options.puzzlesSolved, getPuzzlesSolvedFromProfileData(legacyTraining, completedPuzzleIds));
    const gamesAnalyzed = trainingToStoredCount(options.gamesAnalyzed, getGamesAnalyzedFromWeaknessProfile(legacyWeakness));
    const estimatedRating = trainingToStoredCount(options.estimatedRating, getEstimatedRatingFromWeaknessProfile(legacyWeakness));
    const weaknesses = Array.isArray(options.weaknesses) ? options.weaknesses : getWeaknessesFromWeaknessProfile(legacyWeakness);

    return {
        chessComUsername: normalizedUsername === LOCAL_PROFILE_USERNAME ? '' : normalizedUsername,
        displayName: normalizedUsername === LOCAL_PROFILE_USERNAME ? 'Local Profile' : normalizedUsername,
        avatarUrl: options.avatarUrl || null,
        puzzleLevel: Math.max(1, getTrainingDisplayedLevelFromXp(totalXp, legacyTraining)),
        xp: totalXp,
        totalXp,
        currentLevelXp,
        streak: Math.max(0, Math.floor(Number(options.streak || legacyTraining.currentStreak || 0) || 0)),
        hp: Math.max(0, Math.floor(Number(options.hp || options.currentHp || 5) || 0)),
        currentHp: Math.max(0, Math.floor(Number(options.hp || options.currentHp || 5) || 0)),
        sessionXp: Math.max(0, Math.floor(Number(options.sessionXp || 0) || 0)),
        completedPuzzleIds,
        puzzlesSolved,
        gamesAnalyzed,
        estimatedRating,
        trainingStats: {
            totalPuzzlesAttempted: trainingToStoredCount(legacyTraining.totalPuzzlesAttempted),
            totalPuzzlesSolved: puzzlesSolved,
            totalCorrect: trainingToStoredCount(legacyTraining.totalCorrect),
            totalIncorrect: trainingToStoredCount(legacyTraining.totalIncorrect),
            totalSessionsPlayed: trainingToStoredCount(legacyTraining.totalSessionsPlayed),
            bestOverallStreak: trainingToStoredCount(legacyTraining.bestOverallStreak),
            totalGameOvers: trainingToStoredCount(legacyTraining.totalGameOvers),
            bossWins: trainingToStoredCount(legacyTraining.bossWins)
        },
        trainingPlayerProfile: {
            ...legacyTraining,
            totalXp,
            currentLevelXp,
            completedPuzzleIds,
            currentStreak: Math.max(0, Math.floor(Number(options.streak || legacyTraining.currentStreak || 0) || 0))
        },
        weaknessProfile: legacyWeakness,
        activityLog: legacyActivity,
        weaknesses,
        coachHistory: Array.isArray(options.coachHistory) ? options.coachHistory : [],
        gameStats: {
            total: 0,
            won: 0,
            lost: 0,
            drawn: 0
        },
        createdAt: options.createdAt || now,
        lastActiveAt: now
    };
}

function syncLegacyTrainingKeysFromProfile(profile) {
    const trainingPlayerProfile = profile && profile.trainingPlayerProfile ? profile.trainingPlayerProfile : {};
    localStorage.setItem('training_player_profile', JSON.stringify(trainingPlayerProfile));
    localStorage.setItem('training_total_xp', String(profile && Number.isFinite(Number(profile.totalXp)) ? Math.floor(Number(profile.totalXp)) : 0));
    localStorage.setItem('training_current_streak', String(profile && Number.isFinite(Number(profile.streak)) ? Math.floor(Number(profile.streak)) : 0));
    if (profile && profile.weaknessProfile) {
        localStorage.setItem('training_weakness_profile', JSON.stringify(profile.weaknessProfile));
    } else {
        localStorage.removeItem('training_weakness_profile');
    }
    localStorage.setItem('chess_recent_activity', JSON.stringify(Array.isArray(profile && profile.activityLog) ? profile.activityLog : []));
}

function migrateGlobalProgressForUsername(username, profiles) {
    const normalizedUsername = normalizeProfileUsername(username);
    if (normalizedUsername === LOCAL_PROFILE_USERNAME || profiles[normalizedUsername]) return profiles;
    const migrated = readJsonStorage(PROFILE_MIGRATION_KEY, {}) || {};
    if (migrated[normalizedUsername]) return profiles;
    const globalProgressAlreadyMigrated = Object.values(migrated).some(Boolean);
    const hasExistingChessComProfiles = Object.keys(profiles).some(key => key !== LOCAL_PROFILE_USERNAME);
    if (globalProgressAlreadyMigrated || hasExistingChessComProfiles) {
        migrated[normalizedUsername] = true;
        localStorage.setItem(PROFILE_MIGRATION_KEY, JSON.stringify(migrated));
        return profiles;
    }

    const legacyTraining = readGlobalTrainingProfile();
    const legacyXp = Number(localStorage.getItem('training_total_xp') || legacyTraining.totalXp || 0) || 0;
    const legacyStreak = Number(localStorage.getItem('training_current_streak') || legacyTraining.currentStreak || 0) || 0;
    const hasLegacyProgress = legacyXp > 0
        || legacyStreak > 0
        || (Array.isArray(legacyTraining.completedPuzzleIds) && legacyTraining.completedPuzzleIds.length > 0)
        || trainingToStoredCount(legacyTraining.totalPuzzlesAttempted) > 0
        || getGamesAnalyzedFromWeaknessProfile(readJsonStorage('training_weakness_profile', null)) > 0
        || getEstimatedRatingFromWeaknessProfile(readJsonStorage('training_weakness_profile', null)) > 0;

    if (hasLegacyProgress) {
        profiles[normalizedUsername] = createDefaultAccountProfile(normalizedUsername, {
            trainingPlayerProfile: legacyTraining,
            totalXp: legacyXp,
            streak: legacyStreak,
            weaknessProfile: readJsonStorage('training_weakness_profile', null),
            activityLog: readJsonStorage('chess_recent_activity', [])
        });
    }
    migrated[normalizedUsername] = true;
    localStorage.setItem(PROFILE_MIGRATION_KEY, JSON.stringify(migrated));
    return profiles;
}

function createProfileForUsername(username) {
    const normalizedUsername = normalizeProfileUsername(username);
    let profiles = readAccountProfiles();
    profiles = migrateGlobalProgressForUsername(normalizedUsername, profiles);
    if (!profiles[normalizedUsername]) {
        profiles[normalizedUsername] = createDefaultAccountProfile(normalizedUsername);
    }
    saveAccountProfiles(profiles);
    return profiles[normalizedUsername];
}

function getActiveProfile() {
    const username = normalizeProfileUsername(localStorage.getItem(ACTIVE_PROFILE_USERNAME_KEY) || getChessComUsername());
    const profile = createProfileForUsername(username);
    syncLegacyTrainingKeysFromProfile(profile);
    return profile;
}

function updateActiveProfileProgress(updater) {
    const activeUsername = normalizeProfileUsername(localStorage.getItem(ACTIVE_PROFILE_USERNAME_KEY) || getChessComUsername());
    const profiles = readAccountProfiles();
    const currentProfile = profiles[activeUsername] || createProfileForUsername(activeUsername);
    const nextProfile = typeof updater === 'function'
        ? updater({ ...currentProfile, trainingPlayerProfile: { ...(currentProfile.trainingPlayerProfile || {}) } })
        : { ...currentProfile, ...(updater || {}) };
    const now = new Date().toISOString();
    const trainingPlayerProfile = nextProfile.trainingPlayerProfile || {};
    const totalXp = Math.max(0, Math.floor(Number(nextProfile.totalXp ?? nextProfile.xp ?? trainingPlayerProfile.totalXp ?? 0) || 0));
    const currentLevelXp = getCurrentLevelXpFromProfileData(trainingPlayerProfile, totalXp);
    const completedPuzzleIds = Array.isArray(trainingPlayerProfile.completedPuzzleIds)
        ? trainingPlayerProfile.completedPuzzleIds
        : (Array.isArray(nextProfile.completedPuzzleIds) ? nextProfile.completedPuzzleIds : []);
    const normalizedCompletedPuzzleIds = Array.from(new Set(completedPuzzleIds.map(id => String(id)).filter(Boolean)));
    const streak = Math.max(0, Math.floor(Number(nextProfile.streak ?? trainingPlayerProfile.currentStreak ?? 0) || 0));
    const puzzlesSolved = getPuzzlesSolvedFromProfileData(trainingPlayerProfile, normalizedCompletedPuzzleIds)
        || trainingToStoredCount(nextProfile.puzzlesSolved);
    const weaknessProfile = nextProfile.weaknessProfile || null;
    const gamesAnalyzed = Math.max(
        trainingToStoredCount(currentProfile.gamesAnalyzed),
        trainingToStoredCount(nextProfile.gamesAnalyzed),
        getGamesAnalyzedFromWeaknessProfile(weaknessProfile)
    );
    const estimatedRating = Number.isFinite(Number(nextProfile.estimatedRating))
        ? Math.max(0, Math.floor(Number(nextProfile.estimatedRating) || 0))
        : trainingToStoredCount(currentProfile.estimatedRating, getEstimatedRatingFromWeaknessProfile(weaknessProfile));
    const weaknesses = Array.isArray(nextProfile.weaknesses) ? nextProfile.weaknesses : getWeaknessesFromWeaknessProfile(weaknessProfile);
    const hp = Math.max(0, Math.floor(Number(nextProfile.hp ?? nextProfile.currentHp ?? 5) || 0));
    const sessionProfileXp = Math.max(0, Math.floor(Number(nextProfile.sessionXp || 0) || 0));
    const trainingStats = {
        ...(currentProfile.trainingStats || {}),
        ...(nextProfile.trainingStats || {}),
        totalPuzzlesSolved: puzzlesSolved
    };

    profiles[activeUsername] = {
        ...currentProfile,
        ...nextProfile,
        chessComUsername: activeUsername === LOCAL_PROFILE_USERNAME ? '' : activeUsername,
        totalXp,
        xp: totalXp,
        currentLevelXp,
        puzzleLevel: Math.max(1, getTrainingDisplayedLevelFromXp(totalXp, trainingPlayerProfile)),
        streak,
        hp,
        currentHp: hp,
        sessionXp: sessionProfileXp,
        completedPuzzleIds: normalizedCompletedPuzzleIds,
        puzzlesSolved,
        gamesAnalyzed,
        estimatedRating,
        trainingStats,
        weaknessProfile,
        weaknesses,
        coachHistory: Array.isArray(nextProfile.coachHistory) ? nextProfile.coachHistory : (currentProfile.coachHistory || []),
        trainingPlayerProfile: {
            ...trainingPlayerProfile,
            totalXp,
            currentLevelXp,
            currentStreak: streak,
            totalPuzzlesSolved: Math.max(trainingToStoredCount(trainingPlayerProfile.totalPuzzlesSolved), puzzlesSolved),
            completedPuzzleIds: normalizedCompletedPuzzleIds
        },
        lastActiveAt: now
    };
    saveAccountProfiles(profiles);
    syncLegacyTrainingKeysFromProfile(profiles[activeUsername]);
    return profiles[activeUsername];
}

function switchActiveProfile(username) {
    const normalizedUsername = normalizeProfileUsername(username);
    const profile = createProfileForUsername(normalizedUsername);
    localStorage.setItem(ACTIVE_PROFILE_USERNAME_KEY, normalizedUsername);
    syncLegacyTrainingKeysFromProfile(profile);
    window.dispatchEvent(new CustomEvent('chess-profile-switched', { detail: { username: normalizedUsername, profile } }));
    return profile;
}

window.getActiveProfile = getActiveProfile;
window.updateActiveProfileProgress = updateActiveProfileProgress;
window.createProfileForUsername = createProfileForUsername;
window.switchActiveProfile = switchActiveProfile;
window.normalizeChessComUsername = normalizeChessComUsername;

function getChessComUsername() {
    let saved = localStorage.getItem('chess_com_username');
    if (saved) return saved;

    try {
        const chessComGame = savedGames.find(g => g.chessCom && g.chessCom.username);
        if (chessComGame) {
            const detectedUsername = chessComGame.chessCom.username;
            localStorage.setItem('chess_com_username', detectedUsername);
            return detectedUsername;
        }
    } catch (e) {
        console.warn('Failed to detect chess.com username from storage:', e);
    }
    return '';
}

function isChessComPrivacyAllowed() {
    return window.chessForgePrivacy?.entitlements?.chesscom_link === true;
}

function setChessComUsername(username) {
    if (username) {
        const normalizedUsername = normalizeChessComUsername(username);
        localStorage.setItem('chess_com_username', normalizedUsername);
        switchActiveProfile(normalizedUsername);
    } else {
        localStorage.removeItem('chess_com_username');
        switchActiveProfile(LOCAL_PROFILE_USERNAME);
    }
    renderProfileMenuState();
    renderProfilePage();
    renderDashboardHome();
}

async function refreshChessComProfileMetadata(username) {
    const normalizedUsername = normalizeChessComUsername(username);
    if (!normalizedUsername) return null;
    try {
        const player = await fetchChessComJson(`https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}`);
        const avatarUrl = player && player.avatar ? String(player.avatar) : null;
        updateActiveProfileProgress(profile => ({
            ...profile,
            displayName: player && player.name ? String(player.name) : profile.displayName,
            avatarUrl: avatarUrl || profile.avatarUrl || null
        }));
        renderProfilePage();
        renderDashboardHome();
        return player;
    } catch (err) {
        console.warn('[ChessComSync] Could not load Chess.com profile metadata:', err);
        return null;
    }
}

async function clearGameLibraryBeforeChessComAccountSwitch(previousUsername, nextUsername) {
    if (!previousUsername || previousUsername === nextUsername) return false;

    appendChessComSyncLog(`[ChessComSync] Switching Chess.com account from @${previousUsername} to @${nextUsername}; clearing existing game library first.`);
    setChessComBackgroundSyncStatus(`Switching to @${nextUsername}... clearing previous games first.`);

    await saveSavedGamesToStorage([]);
    localStorage.removeItem('chess_com_last_sync_at');
    currentLoadedGame = null;
    renderGameLibrary();
    renderProfilePage();

    return true;
}

async function clearGameLibraryForChessComDisconnect(username) {
    appendChessComSyncLog(username
        ? `[ChessComSync] Disconnecting @${username}; clearing game library.`
        : '[ChessComSync] Disconnecting Chess.com; clearing game library.');
    setChessComBackgroundSyncStatus('Disconnecting Chess.com... clearing synced games first.');

    await saveSavedGamesToStorage([]);
    localStorage.removeItem('chess_com_last_sync_at');
    currentLoadedGame = null;
    renderGameLibrary();
    renderProfilePage();
}

function disableChessComBackgroundSync() {
    chessComBackgroundSyncStarted = false;
    if (chessComBackgroundSyncTimer) {
        clearTimeout(chessComBackgroundSyncTimer);
        chessComBackgroundSyncTimer = null;
    }
}

function closeProfileDropdown() {
    const profileNav = navigationDropdowns.find(nav => nav.trigger === btnProfileMenu);
    if (profileNav) setNavigationDropdownOpen(profileNav, false);
}

function toggleProfileDropdown() {
    const profileNav = navigationDropdowns.find(nav => nav.trigger === btnProfileMenu);
    if (profileNav) toggleNavigationDropdown(profileNav);
}

function renderProfileMenuState() {
    if (!profileConnectionStatus && !profileDropdown && !btnProfileMenu) return;
    const username = getChessComUsername();
    const isConnected = Boolean(username);
    if (btnProfileMenu) {
        btnProfileMenu.classList.toggle('is-connected', isConnected);
    }
    if (profileConnectionStatus) {
        profileConnectionStatus.classList.toggle('connected', isConnected);
        profileConnectionStatus.innerHTML = isConnected
            ? `<span class="profile-connection-dot" aria-hidden="true"></span><span>Chess.com connected<br><strong>@${username}</strong></span>`
            : '<span class="profile-connection-dot" aria-hidden="true"></span><span>No Chess.com account connected</span>';
    }
    const connectItem = profileDropdown && profileDropdown.querySelector('[data-profile-action="connect-chesscom"]');
    if (connectItem) {
        const allowed = isChessComPrivacyAllowed();
        connectItem.disabled = !allowed;
        connectItem.setAttribute('aria-disabled', String(!allowed));
        connectItem.innerText = allowed ? (isConnected ? 'Manage Chess.com Connection' : 'Connect to Chess.com') : 'Chess.com linking requires privacy approval';
    }
}

function handleProfileMenuAction(action) {
    closeProfileDropdown();
    if (action === 'view-profile' || action === 'account-settings') {
        navigateToRoute(APP_ROUTES.PROFILE);
        return;
    }
    if (action === 'connect-chesscom') {
        openChessComSyncModal();
        return;
    }
    if (action === 'sign-out') {
        localStorage.removeItem('chess_profile_username');
        setChessComBackgroundSyncStatus('Signed out of the local profile.', '');
        renderProfilePage();
    }
}

function splitCombinedPgnText(combinedText) {
    const text = String(combinedText || '').replace(/\r\n/g, '\n').trim();
    if (!text) return [];

    return text
        .split(/\n(?=\[Event\s+")/g)
        .map(pgn => pgn.trim())
        .filter(pgn => pgn.startsWith('[Event ') && /\n\s*1\./.test(pgn));
}

function getPgnStableKey(pgnText) {
    const tempGame = new Chess();
    const normalizedPgn = String(pgnText || '').trim();

    if (tempGame.load_pgn(normalizedPgn)) {
        const headers = tempGame.header();
        const site = headers.Site || '';
        const date = headers.UTCDate || headers.Date || '';
        const time = headers.UTCTime || headers.Time || '';
        const white = headers.White || '';
        const black = headers.Black || '';
        const result = headers.Result || '';
        const moves = tempGame.history().join(' ');
        return [site, date, time, white, black, result, moves].join('|').toLowerCase();
    }

    return normalizedPgn.replace(/\s+/g, ' ').toLowerCase();
}

function getChessComGameKey(gameRecord) {
    const chessCom = gameRecord && gameRecord.chessCom;
    return chessCom && (chessCom.uuid || chessCom.url || chessCom.archiveUrl || chessCom.pgnUrl);
}

function normalizeGameKeyPart(value) {
    return String(value || '').trim().toLowerCase();
}

function getGameIdentityKeys(gameRecord) {
    if (!gameRecord) return [];
    const keys = new Set();
    const headers = gameRecord.headers || {};
    const chessCom = gameRecord.chessCom || {};
    const gameMetadata = gameRecord.gameMetadata || {};
    const date = normalizeGameKeyPart(
        headers.UTCDate ||
        headers.Date ||
        gameRecord.UTCDate ||
        gameRecord.Date ||
        gameRecord.gameDate ||
        gameMetadata.date
    );
    const white = normalizeGameKeyPart(headers.White || gameRecord.white);
    const black = normalizeGameKeyPart(headers.Black || gameRecord.black);
    const result = normalizeGameKeyPart(headers.Result || gameRecord.result);

    if (gameRecord.id) keys.add(`id:${normalizeGameKeyPart(gameRecord.id)}`);
    if (chessCom.uuid) keys.add(`cc-uuid:${normalizeGameKeyPart(chessCom.uuid)}`);
    if (gameMetadata.uuid) keys.add(`cc-uuid:${normalizeGameKeyPart(gameMetadata.uuid)}`);
    if (chessCom.url) keys.add(`cc-url:${normalizeGameKeyPart(chessCom.url)}`);
    if (gameMetadata.url) keys.add(`cc-url:${normalizeGameKeyPart(gameMetadata.url)}`);
    if (date && white && black) keys.add(`players:${date}:${white}:${black}:${result}`);

    return Array.from(keys);
}

async function savedGameKeys() {
    const keys = new Set();
    for (const gameRecord of savedGames) {
        const chessComKey = getChessComGameKey(gameRecord);
        if (chessComKey) keys.add(String(chessComKey).toLowerCase());
        getGameIdentityKeys(gameRecord).forEach(key => keys.add(key));

        const runtimeGame = await hydrateGameForRuntime(gameRecord);
        const pgn = runtimeGame && !runtimeGame.hydrationError && (runtimeGame.pgn || runtimeGame.rawPGN);
        if (pgn) keys.add(getPgnStableKey(pgn));
    }
    return keys;
}

function chessComDateFromEndTime(endTime) {
    if (!endTime) return null;
    const timestamp = Number(endTime);
    if (!Number.isFinite(timestamp)) return null;
    const date = new Date(timestamp * 1000);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`;
}

function getCurrentWeekStart(now = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return start.getTime();
}

function isChessComApiGameFromThisWeek(apiGame) {
    const endTime = Number(apiGame && apiGame.end_time);
    if (!Number.isFinite(endTime)) return false;
    return endTime * 1000 >= getCurrentWeekStart();
}

function getChessComApiGameId(apiGame) {
    return String((apiGame && (apiGame.uuid || apiGame.url)) || `chesscom_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`)
        .replace(/^https?:\/\//, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
}

function chessComResultFromApiGame(apiGame) {
    const whiteResult = apiGame && apiGame.white && apiGame.white.result;
    const blackResult = apiGame && apiGame.black && apiGame.black.result;
    if (whiteResult === 'win') return '1-0';
    if (blackResult === 'win') return '0-1';
    if (whiteResult && blackResult && whiteResult === blackResult) return '1/2-1/2';
    return '*';
}

function createChessComGameObject(pgnText, username) {
    const tempGame = new Chess();
    if (!tempGame.load_pgn(pgnText)) return null;

    const headers = tempGame.header();
    const history = tempGame.history();
    const normalizedUsername = normalizeChessComUsername(username);
    const gameDate = headers.UTCDate || headers.Date || headers.EndDate || null;
    const white = headers.White || 'Unknown White';
    const black = headers.Black || 'Unknown Black';
    const whiteMatch = normalizeChessComUsername(white) === normalizedUsername;
    const blackMatch = normalizeChessComUsername(black) === normalizedUsername;
    const userColor = whiteMatch ? 'white' : (blackMatch ? 'black' : null);
    const title = `${white} vs ${black}`;

    return {
        id: `chesscom_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        title,
        name: title,
        storageMode: 'raw',
        pgn: pgnText,
        aiTextFormat: convertPgnToAiTextFormat(pgnText),
        compressed: null,
        headers,
        gameDate,
        Date: headers.Date,
        UTCDate: headers.UTCDate,
        EndDate: headers.EndDate,
        moveCount: history.length,
        result: headers.Result || '*',
        createdAt: new Date().toISOString(),
        source: 'chess.com',
        chessCom: {
            username: normalizedUsername,
            userColor,
            url: headers.Link || headers.Site || null
        },
        gameMetadata: {
            source: 'chess.com',
            username: normalizedUsername,
            userColor,
            site: headers.Site || null,
            event: headers.Event || null,
            date: headers.Date || null,
            result: headers.Result || '*'
        }
    };
}

function createChessComGameObjectFromApi(apiGame, username, archiveUrl) {
    if (!apiGame || !apiGame.pgn) return null;
    const gameObject = createChessComGameObject(apiGame.pgn, username);
    if (!gameObject) return null;

    const uuid = apiGame.uuid || null;
    const url = apiGame.url || (gameObject.chessCom && gameObject.chessCom.url) || null;
    gameObject.id = getChessComApiGameId(apiGame);
    gameObject.chessCom = {
        ...(gameObject.chessCom || {}),
        username: normalizeChessComUsername(username),
        uuid,
        url,
        archiveUrl,
        endTime: apiGame.end_time || null,
        timeClass: apiGame.time_class || null,
        rules: apiGame.rules || null
    };
    gameObject.gameMetadata = {
        ...(gameObject.gameMetadata || {}),
        source: 'chess.com',
        archiveUrl,
        uuid,
        url,
        endTime: apiGame.end_time || null
    };
    return gameObject;
}

function createChessComMetadataGameObject(apiGame, username, archiveUrl) {
    if (!apiGame) return null;

    const normalizedUsername = normalizeChessComUsername(username);
    const white = apiGame.white && apiGame.white.username ? apiGame.white.username : 'Unknown White';
    const black = apiGame.black && apiGame.black.username ? apiGame.black.username : 'Unknown Black';
    const userColor = normalizeChessComUsername(white) === normalizedUsername
        ? 'white'
        : (normalizeChessComUsername(black) === normalizedUsername ? 'black' : null);
    const gameDate = chessComDateFromEndTime(apiGame.end_time);
    const result = chessComResultFromApiGame(apiGame);
    const uuid = apiGame.uuid || null;
    const url = apiGame.url || null;

    return {
        id: getChessComApiGameId(apiGame),
        title: `${white} vs ${black}`,
        name: `${white} vs ${black}`,
        storageMode: 'metadata-only',
        isMetadataOnly: true,
        pgn: null,
        rawPGN: null,
        aiTextFormat: null,
        compressed: null,
        gameDate,
        Date: gameDate,
        headers: {
            Event: 'Chess.com Game',
            Site: url || 'Chess.com',
            Date: gameDate,
            White: white,
            Black: black,
            Result: result
        },
        moveCount: null,
        result,
        createdAt: new Date().toISOString(),
        source: 'chess.com',
        chessCom: {
            username: normalizedUsername,
            userColor,
            uuid,
            url,
            archiveUrl,
            endTime: apiGame.end_time || null,
            timeClass: apiGame.time_class || null,
            rules: apiGame.rules || null,
            lazy: true
        },
        gameMetadata: {
            source: 'chess.com',
            username: normalizedUsername,
            userColor,
            archiveUrl,
            uuid,
            url,
            endTime: apiGame.end_time || null,
            date: gameDate,
            result
        }
    };
}

function buildChessComSyncModal() {
    let modal = document.getElementById('chessComSyncModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'chessComSyncModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content chesscom-connect-modal">
            <div class="chesscom-modal-heading">
                <div class="chesscom-logo-mark" aria-hidden="true">♟</div>
                <div>
                    <h2>Connect to Chess.com</h2>
                    <p>Connecting a Chess.com username enables automatic background game synchronization for your library, profile, and training tools.</p>
                </div>
            </div>
            <div class="form-group">
                <label for="chessComUsername">Chess.com Username</label>
                <input type="text" id="chessComUsername" placeholder="username" autocomplete="username">
            </div>
            <div id="chessComConnectionSummary" class="chesscom-connection-summary"></div>
            <div class="modal-actions">
                <button id="btnCancelChessComSync" class="secondary-btn">Cancel</button>
                <button id="btnDisconnectChessCom" class="secondary-btn danger-btn" type="button" style="display: none;">Disconnect</button>
                <button id="btnStartChessComSync" class="primary-btn">Connect</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btnCancelChessComSync').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    document.getElementById('btnStartChessComSync').addEventListener('click', connectChessComAccount);
    document.getElementById('btnDisconnectChessCom').addEventListener('click', disconnectChessComAccount);

    return modal;
}

function appendChessComSyncLog(message) {
    console.log(message);
    const logEl = document.getElementById('chessComSyncLog');
    if (!logEl) return;
    logEl.value += `${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
}

function ensureChessComBackgroundSyncStatus() {
    let status = document.getElementById('chessComBackgroundSyncStatus');
    if (status || !gameLibrary || !gameLibrary.parentElement) return status;

    status = document.createElement('div');
    status.id = 'chessComBackgroundSyncStatus';
    status.className = 'background-sync-status';
    status.style.display = 'none';
    gameLibrary.parentElement.insertBefore(status, gameLibrary);
    return status;
}

function setChessComBackgroundSyncStatus(message, kind = '') {
    const status = ensureChessComBackgroundSyncStatus();
    if (!status) return;

    if (!message) {
        status.style.display = 'none';
        status.innerText = '';
        status.className = 'background-sync-status';
        return;
    }

    status.style.display = 'block';
    status.className = `background-sync-status${kind ? ` ${kind}` : ''}`;
    status.innerText = message;
}

function setChessComSyncRunning(isRunning) {
    const startBtn = document.getElementById('btnStartChessComSync');
    const cancelBtn = document.getElementById('btnCancelChessComSync');
    const disconnectBtn = document.getElementById('btnDisconnectChessCom');
    const usernameInput = document.getElementById('chessComUsername');

    if (startBtn) {
        startBtn.disabled = isRunning;
        startBtn.innerText = isRunning ? 'Connecting...' : (getChessComUsername() ? 'Update Connection' : 'Connect');
    }
    if (cancelBtn) cancelBtn.disabled = isRunning;
    if (disconnectBtn) disconnectBtn.disabled = isRunning;
    if (usernameInput) usernameInput.disabled = isRunning;
}

function openChessComSyncModal() {
    if (!isChessComPrivacyAllowed()) {
        alert('Chess.com linking is off. Enable it in the ChessForge Privacy Center or ask your guardian to approve it.');
        return;
    }
    const modal = buildChessComSyncModal();
    const usernameInput = document.getElementById('chessComUsername');
    const summary = document.getElementById('chessComConnectionSummary');
    const startBtn = document.getElementById('btnStartChessComSync');
    const disconnectBtn = document.getElementById('btnDisconnectChessCom');
    const username = getChessComUsername();

    if (usernameInput) usernameInput.value = username;
    if (summary) {
        summary.innerHTML = username
            ? `<span class="profile-connection-dot connected" aria-hidden="true"></span><span>Connected as <strong>@${username}</strong>. Update the username or disconnect this account.</span>`
            : '<span class="profile-connection-dot" aria-hidden="true"></span><span>No account connected yet. Enter a public Chess.com username to enable background sync.</span>';
    }
    if (startBtn) startBtn.innerText = username ? 'Update Connection' : 'Connect';
    if (disconnectBtn) disconnectBtn.style.display = username ? 'inline-block' : 'none';
    modal.style.display = 'flex';
    if (usernameInput) usernameInput.focus();
}

async function connectChessComAccount() {
    if (!isChessComPrivacyAllowed()) {
        alert('Chess.com linking is not approved for this account.');
        return;
    }
    const usernameInput = document.getElementById('chessComUsername');
    const modal = document.getElementById('chessComSyncModal');
    const username = normalizeChessComUsername(usernameInput && usernameInput.value);
    const previousUsername = normalizeChessComUsername(getChessComUsername());

    if (!username) {
        alert('Please enter a Chess.com username.');
        return;
    }

    setChessComSyncRunning(true);
    try {
        await clearGameLibraryBeforeChessComAccountSwitch(previousUsername, username);
        setChessComUsername(username);
        refreshChessComProfileMetadata(username);
        if (modal) modal.style.display = 'none';
        setChessComBackgroundSyncStatus(`Chess.com connected as @${username}. Background sync is enabled.`, 'success');
        disableChessComBackgroundSync();
        startBackgroundChessComSync();
    } catch (err) {
        console.error('[ChessComSync] Failed to clear existing games before account switch:', err);
        setChessComBackgroundSyncStatus('Could not clear previous games. Account was not switched.', 'error');
        alert('Could not clear previous games before switching Chess.com accounts. Please make sure the backend is running and try again.');
    } finally {
        setChessComSyncRunning(false);
    }
}

async function disconnectChessComAccount() {
    const modal = document.getElementById('chessComSyncModal');
    const username = normalizeChessComUsername(getChessComUsername());

    setChessComSyncRunning(true);
    try {
        disableChessComBackgroundSync();
        await clearGameLibraryForChessComDisconnect(username);
        setChessComUsername('');
        setChessComBackgroundSyncStatus('Chess.com account disconnected. Library cleared and background sync is disabled.', 'success');
        if (modal) modal.style.display = 'none';
        setTimeout(() => setChessComBackgroundSyncStatus(''), 5000);
    } catch (err) {
        console.error('[ChessComSync] Failed to clear games before disconnect:', err);
        setChessComBackgroundSyncStatus('Could not clear games. Chess.com account was not disconnected.', 'error');
        alert('Could not clear games before disconnecting Chess.com. Please make sure the backend is running and try again.');
    } finally {
        setChessComSyncRunning(false);
    }
}

async function fetchChessComJson(url) {
    if (!isChessComPrivacyAllowed()) throw new Error('Chess.com linking is not approved for this account.');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json();
}

async function fetchChessComText(url) {
    if (!isChessComPrivacyAllowed()) throw new Error('Chess.com linking is not approved for this account.');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.text();
}

async function performChessComIncrementalSync(username, options = {}) {
    const normalizedUsername = normalizeChessComUsername(username);
    const isBackground = Boolean(options.background);
    const stats = {
        localGamesBefore: savedGames.length,
        archivesFound: 0,
        chessComGamesFound: 0,
        gamesParsed: 0,
        gamesImported: 0,
        fullGamesImported: 0,
        metadataGamesImported: 0,
        duplicatesSkipped: 0,
        failedGames: 0
    };

    if (!normalizedUsername || chessComSyncInProgress) return stats;

    chessComSyncInProgress = true;
    setChessComUsername(normalizedUsername);

    try {
        if (!isBackground) setChessComSyncRunning(true);
        if (isBackground) {
            setChessComBackgroundSyncStatus(`Checking Chess.com for new games... local library has ${stats.localGamesBefore} game${stats.localGamesBefore === 1 ? '' : 's'}.`);
        }

        appendChessComSyncLog(isBackground ? '[ChessComSync] Starting background Chess.com sync' : '[ChessComSync] Starting incremental Chess.com sync');
        appendChessComSyncLog(`[ChessComSync] Username: ${normalizedUsername}`);
        appendChessComSyncLog(`[ChessComSync] Local games stored: ${stats.localGamesBefore}`);

        const archivesData = await fetchChessComJson(`https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}/games/archives`);
        const archives = Array.isArray(archivesData.archives) ? archivesData.archives : [];
        stats.archivesFound = archives.length;
        appendChessComSyncLog(`[ChessComSync] Archives found: ${stats.archivesFound}`);

        const existingKeys = await savedGameKeys();
        const savedGamesBeforeSync = [...savedGames];
        const importedGames = [];

        for (const archiveUrl of archives.slice().reverse()) {
            try {
                appendChessComSyncLog(`[ChessComSync] Scanning archive for weekly games and older cards: ${archiveUrl}`);
                const archiveData = await fetchChessComJson(archiveUrl);
                const games = Array.isArray(archiveData.games) ? archiveData.games : [];

                for (const apiGame of games.slice().reverse()) {
                    stats.gamesParsed++;

                    const importFullGame = isChessComApiGameFromThisWeek(apiGame);
                    const gameObject = importFullGame
                        ? createChessComGameObjectFromApi(apiGame, normalizedUsername, archiveUrl)
                        : createChessComMetadataGameObject(apiGame, normalizedUsername, archiveUrl);
                    if (!gameObject) {
                        stats.failedGames++;
                        continue;
                    }

                    const keys = [
                        String(apiGame.uuid || apiGame.url || getChessComApiGameId(apiGame)).toLowerCase(),
                        ...getGameIdentityKeys(gameObject)
                    ];
                    if (keys.some(key => existingKeys.has(key))) {
                        stats.duplicatesSkipped++;
                        continue;
                    }

                    keys.forEach(key => existingKeys.add(key));
                    const pgn = gameObject.pgn || gameObject.rawPGN;
                    if (pgn) existingKeys.add(getPgnStableKey(pgn));
                    importedGames.push(gameObject);
                    savedGames = limitLibraryGames([...importedGames, ...savedGamesBeforeSync]);
                    renderGameLibrary();
                    if (importFullGame) {
                        stats.fullGamesImported++;
                        stats.gamesImported++;
                    } else {
                        stats.metadataGamesImported++;
                    }
                    if (isBackground) {
                        setChessComBackgroundSyncStatus(`Syncing Chess.com... full games this week: ${stats.fullGamesImported}; older cards: ${stats.metadataGamesImported}.`);
                    }
                }

                stats.chessComGamesFound = stats.gamesParsed;
                appendChessComSyncLog(`[ChessComSync] Chess.com records checked: ${stats.gamesParsed}`);
                appendChessComSyncLog(`[ChessComSync] Full games synced this week: ${stats.fullGamesImported}`);
                appendChessComSyncLog(`[ChessComSync] Older metadata cards added: ${stats.metadataGamesImported}`);
                appendChessComSyncLog(`[ChessComSync] Duplicates skipped: ${stats.duplicatesSkipped}`);
                appendChessComSyncLog(`[ChessComSync] Failed games: ${stats.failedGames}`);
            } catch (err) {
                stats.failedGames++;
                appendChessComSyncLog(`[ChessComSync] Archive failed: ${archiveUrl} (${err.message})`);
            }
        }

        stats.chessComGamesFound = stats.gamesParsed;
        await saveSavedGamesToStorage(savedGames);
        localStorage.setItem('chess_com_last_sync_at', new Date().toISOString());
        renderGameLibrary();

        appendChessComSyncLog(`[ChessComSync] Chess.com records checked: ${stats.chessComGamesFound}`);
        appendChessComSyncLog(`[ChessComSync] Full games synced this week: ${stats.fullGamesImported}`);
        appendChessComSyncLog(`[ChessComSync] Older metadata cards added: ${stats.metadataGamesImported}`);
        appendChessComSyncLog(`[ChessComSync] Duplicates skipped: ${stats.duplicatesSkipped}`);
        appendChessComSyncLog(`[ChessComSync] Failed games: ${stats.failedGames}`);

        if (isBackground) {
            const message = `Chess.com sync complete: ${stats.fullGamesImported} full game${stats.fullGamesImported === 1 ? '' : 's'} from this week, ${stats.metadataGamesImported} older card${stats.metadataGamesImported === 1 ? '' : 's'} added.`;
            setChessComBackgroundSyncStatus(message, stats.fullGamesImported > 0 || stats.metadataGamesImported > 0 ? 'success' : '');
            setTimeout(() => setChessComBackgroundSyncStatus(''), 5000);
        }
    } catch (err) {
        appendChessComSyncLog(`[ChessComSync] Failed games: ${stats.failedGames}`);
        appendChessComSyncLog(`[ChessComSync] Error: ${err.message}`);
        if (isBackground) {
            setChessComBackgroundSyncStatus('Chess.com background sync could not finish. Check the username in Profile.', 'error');
            setTimeout(() => setChessComBackgroundSyncStatus(''), 7000);
        } else {
            alert(`Chess.com sync failed: ${err.message}`);
        }
    } finally {
        chessComSyncInProgress = false;
        if (!isBackground) setChessComSyncRunning(false);
    }

    return stats;
}

async function syncChessComGames() {
    const username = normalizeChessComUsername(document.getElementById('chessComUsername').value);

    if (!username) {
        alert('Please enter a Chess.com username.');
        return;
    }
    if (chessComSyncInProgress) {
        alert('A Chess.com sync is already running.');
        return;
    }

    await performChessComIncrementalSync(username, { background: false });
}

function startBackgroundChessComSync() {
    if (!isChessComPrivacyAllowed()) return;
    if (chessComBackgroundSyncStarted) return;

    const username = getChessComUsername();
    if (!username) return;

    chessComBackgroundSyncStarted = true;
    chessComBackgroundSyncTimer = setTimeout(() => {
        chessComBackgroundSyncTimer = null;
        if (normalizeChessComUsername(getChessComUsername()) !== normalizeChessComUsername(username)) return;
        performChessComIncrementalSync(username, { background: true });
    }, 750);
}

async function saveGameToStorage(pgnText) {
    const tempGame = new Chess();
    if (!tempGame.load_pgn(pgnText)) {
        alert("Could not parse PGN for saving.");
        return null;
    }

    const headers = tempGame.header();
    const history = tempGame.history();
    const aiText = convertPgnToAiTextFormat(pgnText);
    const gameDate = headers.UTCDate || headers.Date || headers.EndDate || null;
    
    // Determine title
    let eventTitle = headers.Event;
    if (!eventTitle || eventTitle === "?" || eventTitle === "Untitled Game") {
        if (headers.White && headers.Black) {
            eventTitle = `${headers.White} vs ${headers.Black}`;
        } else {
            eventTitle = "Untitled Game";
        }
    }

    const newGame = {
        id: 'game_' + Date.now(),
        title: eventTitle,
        name: eventTitle,
        storageMode: 'raw',
        pgn: pgnText,
        aiTextFormat: aiText,
        compressed: null,
        gameDate,
        Date: headers.Date,
        UTCDate: headers.UTCDate,
        EndDate: headers.EndDate,
        headers: headers,
        moveCount: history.length,
        result: headers.Result || '*',
        createdAt: new Date().toISOString()
    };

    try {
        const response = await fetch(`${STORAGE_API_BASE}/games`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newGame)
        });
        if (!response.ok) throw new Error(`Filesystem save failed with ${response.status}`);
        const savedGame = await response.json();
        savedGames = limitLibraryGames([savedGame, ...savedGames]);
        await saveSavedGamesToStorage(savedGames);
        localStorage.removeItem('chess_saved_games');
        localStorage.removeItem('chess_saved_games_pending');
        return savedGame;
    } catch (err) {
        console.error('[FileGameStore] Failed to save game to local filesystem:', err);
        alert('Could not save this game to the local filesystem. Please make sure the backend is running with: node backend/server.js');
        return null;
    }
}

async function fetchFullChessComGame(gameRecord) {
    const chessCom = gameRecord && gameRecord.chessCom;
    if (!chessCom || !chessCom.archiveUrl) {
        throw new Error('Missing Chess.com archive URL for this game.');
    }

    const archiveData = await fetchChessComJson(chessCom.archiveUrl);
    const games = Array.isArray(archiveData.games) ? archiveData.games : [];
    const targetUuid = chessCom.uuid ? String(chessCom.uuid).toLowerCase() : '';
    const targetUrl = chessCom.url ? String(chessCom.url).toLowerCase() : '';
    const apiGame = games.find(g => {
        const uuid = g.uuid ? String(g.uuid).toLowerCase() : '';
        const url = g.url ? String(g.url).toLowerCase() : '';
        return (targetUuid && uuid === targetUuid) || (targetUrl && url === targetUrl);
    });

    if (!apiGame || !apiGame.pgn) {
        throw new Error('Could not find the full PGN in the Chess.com archive.');
    }

    const fullGame = createChessComGameObjectFromApi(apiGame, chessCom.username || getChessComUsername(), chessCom.archiveUrl);
    if (!fullGame) {
        throw new Error('Could not parse the Chess.com PGN.');
    }

    fullGame.id = gameRecord.id;
    fullGame.createdAt = gameRecord.createdAt || fullGame.createdAt;
    fullGame.chessCom = {
        ...(fullGame.chessCom || {}),
        lazy: false
    };
    fullGame.isMetadataOnly = false;

    savedGames = savedGames.map(g => g.id === gameRecord.id ? fullGame : g);
    await saveSavedGamesToStorage(savedGames);
    return savedGames.find(g => g.id === gameRecord.id) || fullGame;
}

async function loadGameIntoAnalysis(gameRecord) {
    if (gameRecord && gameRecord.isMetadataOnly) {
        try {
            setAnalysisLoading(gameRecord);
            const fullGame = await fetchFullChessComGame(gameRecord);
            renderGameLibrary();
            await showAnalysisView(fullGame);
        } catch (err) {
            console.error('[ChessComSync] Failed to fetch full game:', err);
            alert('Could not load this Chess.com game yet. Please try syncing again later.');
        }
        return;
    }

    await showAnalysisView(gameRecord);
}

async function openGameFromLibrary(gameRecord) {
    if (gameRecord && gameRecord.id) {
        navigateToRoute(`/game/${encodeURIComponent(gameRecord.id)}`);
        return;
    }

    await loadGameIntoAnalysis(gameRecord);
}

async function deleteGame(id, event) {
    event.stopPropagation();
    if (!confirm("Are you sure you want to delete this game?")) return;
    
    savedGames = savedGames.filter(g => g.id !== id);
    try {
        await fetch(`${STORAGE_API_BASE}/games/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await saveSavedGamesToStorage(savedGames);
    } catch (err) {
        console.error('[FileGameStore] Failed to delete game from local filesystem:', err);
    }
    if (winnerGroupView && winnerGroupView.style.display === 'block' && activeWinnerGroupCategory) {
        showWinnerGroupView(activeWinnerGroupCategory);
    } else {
        renderGameLibrary();
    }

    // Optional Backend Sync
    fetch(`${STORAGE_API_BASE}/games/${id}`, {
        method: 'DELETE'
    }).catch(e => {});
}

// These are no longer needed but kept for compatibility
function showBackendError(msg) {}
function hideBackendError() {}

function getGameTitle(g) {
    if (!g) return "Untitled Game";
    
    // 1. Explicit title or name
    if (g.title && g.title !== "?" && g.title !== "Untitled Game") return String(g.title);
    if (g.name && g.name !== "?" && g.name !== "Untitled Game") return String(g.name);
    
    // 2. Event header
    const event = g.headers ? (g.headers.Event || g.headers.event) : null;
    if (event && event !== "?" && event !== "Untitled Game") return event;
    
    // 3. Fallback: White vs Black
    const white = (g.headers && (g.headers.White || g.headers.white)) || g.white;
    const black = (g.headers && (g.headers.Black || g.headers.black)) || g.black;
    if (white && black && white !== "?" && black !== "?") {
        return `${white} vs ${black}`;
    }
    
    return "Untitled Game";
}

function getGameResult(g) {
    if (!g) return "*";
    if (g.result && g.result !== '*') return g.result;
    if (g.headers) {
        if (g.headers.Result) return g.headers.Result;
        if (g.headers.result) return g.headers.result;
    }
    return g.result || "*";
}

function getWinnerCategory(g) {
    const res = getGameResult(g);
    if (res === '1-0') return 'white';
    if (res === '0-1') return 'black';
    if (res === '1/2-1/2') return 'drawn';
    return 'unknown';
}

function getGameCreatedTime(g) {
    const candidates = [
        g && g.createdAt,
        g && g.savedAt,
        g && g.gameMetadata && g.gameMetadata.date,
        g && g.headers && (g.headers.UTCDate || g.headers.Date)
    ];

    for (const value of candidates) {
        if (!value) continue;
        const normalized = String(value).replace(/\./g, '-');
        const timestamp = Date.parse(normalized);
        if (Number.isFinite(timestamp)) return timestamp;
    }

    return 0;
}

function getPgnHeaderValue(pgnText, headerName) {
    const pattern = new RegExp(`^\\[${headerName}\\s+"([^"]*)"\\]`, 'mi');
    const match = String(pgnText || '').match(pattern);
    return match ? match[1] : null;
}

function getGamePgnDateCandidates(g) {
    if (!g) return [];
    const headers = g.headers || {};
    const metadata = g.gameMetadata || {};
    const chessCom = g.chessCom || {};
    const pgnText = g.pgn || g.rawPGN || '';

    return [
        headers.UTCDate,
        headers.Date,
        headers.EndDate,
        g.UTCDate,
        g.Date,
        g.EndDate,
        g.gameDate,
        metadata.utcDate,
        metadata.date,
        metadata.endDate,
        chessCom.utcDate,
        chessCom.date,
        chessCom.endDate,
        getPgnHeaderValue(pgnText, 'UTCDate'),
        getPgnHeaderValue(pgnText, 'Date'),
        getPgnHeaderValue(pgnText, 'EndDate'),
        g.createdAt,
        g.savedAt
    ].filter(Boolean);
}

function parseGameDateTimestamp(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === '?' || raw === '????.??.??') return 0;
    const normalized = raw.replace(/\?/g, '01');
    const pgnDateMatch = normalized.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})$/);
    if (pgnDateMatch) {
        const [, year, month, day] = pgnDateMatch;
        return Date.UTC(Number(year), Number(month) - 1, Number(day));
    }
    const timestamp = Date.parse(normalized.replace(/\./g, '-'));
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function getGamePlayedTime(g) {
    for (const value of getGamePgnDateCandidates(g)) {
        const timestamp = parseGameDateTimestamp(value);
        if (timestamp) return timestamp;
    }
    return 0;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function readJsonStorage(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
        console.warn(`[DashboardHome] Failed to parse ${key}:`, err);
        return fallback;
    }
}

function trainingToStoredCount(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getTrainingLevelFromXp(xp) {
    const normalizedXp = Math.max(0, Math.floor(Number(xp) || 0));
    return Math.max(1, Math.floor(normalizedXp / TRAINING_XP_PER_LEVEL) + 1);
}

function isTrainingBossLevel(level) {
    return Number.isFinite(Number(level)) && Number(level) > 0 && Number(level) % 3 === 0;
}

function getTrainingBossLevelXpThreshold(level) {
    return Math.max(0, (Math.max(1, Math.floor(Number(level) || 1)) - 1) * TRAINING_XP_PER_LEVEL);
}

function isTrainingBossDefeated(level, defeatedBosses = {}) {
    return Boolean(defeatedBosses && defeatedBosses[String(level)]);
}

function getTrainingBossDefeatXp(level, defeatXpMap = {}) {
    return trainingToStoredCount(defeatXpMap && defeatXpMap[String(level)], getTrainingBossLevelXpThreshold(level));
}

function getTrainingLockedBossLevel(xp, playerProfile = {}) {
    const normalizedXp = Math.max(0, Math.floor(Number(xp) || 0));
    const defeatedBosses = playerProfile.bossesDefeated || {};
    const defeatXpMap = playerProfile.bossDefeatXp || {};

    for (let level = 3; level <= getTrainingLevelFromXp(normalizedXp) + 3; level += 3) {
        if (isTrainingBossDefeated(level, defeatedBosses)) continue;
        if (level === 3) {
            return normalizedXp >= getTrainingBossLevelXpThreshold(level) ? level : null;
        }

        const previousBossLevel = level - 3;
        if (!isTrainingBossDefeated(previousBossLevel, defeatedBosses)) return null;
        const previousDefeatXp = getTrainingBossDefeatXp(previousBossLevel, defeatXpMap);
        const xpNeededAfterPreviousBoss = (level - previousBossLevel - 1) * TRAINING_XP_PER_LEVEL;
        return normalizedXp >= previousDefeatXp + xpNeededAfterPreviousBoss ? level : null;
    }

    return null;
}

function getTrainingDisplayedLevelFromXp(xp, playerProfile = {}) {
    const lockedBossLevel = getTrainingLockedBossLevel(xp, playerProfile);
    if (lockedBossLevel) return lockedBossLevel;

    const defeatedBossLevels = Object.keys(playerProfile.bossesDefeated || {})
        .map(level => Number(level))
        .filter(level => isTrainingBossLevel(level) && isTrainingBossDefeated(level, playerProfile.bossesDefeated))
        .sort((a, b) => a - b);
    const latestDefeatedBossLevel = defeatedBossLevels[defeatedBossLevels.length - 1];
    if (!latestDefeatedBossLevel) return getTrainingLevelFromXp(xp);

    const defeatXp = getTrainingBossDefeatXp(latestDefeatedBossLevel, playerProfile.bossDefeatXp || {});
    const xpAfterBoss = Math.max(0, Math.floor(Number(xp) || 0) - defeatXp);
    const nextBossLevel = latestDefeatedBossLevel + 3;
    const segmentLevel = latestDefeatedBossLevel + 1 + Math.floor(xpAfterBoss / TRAINING_XP_PER_LEVEL);
    return Math.min(getTrainingLevelFromXp(xp), nextBossLevel - 1, segmentLevel);
}

function getSharedTrainingProgress() {
    const activeProfile = getActiveProfile();
    const playerProfile = (activeProfile && activeProfile.trainingPlayerProfile) || readJsonStorage('training_player_profile', {}) || {};
    if (playerProfile.bossesDefeated && playerProfile.bossesDefeated['tactics-goblin'] && !playerProfile.bossesDefeated['3']) {
        playerProfile.bossesDefeated = { ...playerProfile.bossesDefeated, '3': true };
        delete playerProfile.bossesDefeated['tactics-goblin'];
    }
    const totalXp = Math.max(0, Math.floor(Number((activeProfile && activeProfile.totalXp) || playerProfile.totalXp || 0) || 0));
    const lockedBossLevel = getTrainingLockedBossLevel(totalXp, playerProfile);
    const level = lockedBossLevel || getTrainingDisplayedLevelFromXp(totalXp, playerProfile);
    const progressXp = lockedBossLevel ? 0 : getCurrentLevelXpFromProfileData(playerProfile, totalXp);

    return {
        playerProfile,
        totalXp,
        level,
        lockedBossLevel,
        progressXp,
        progressPercent: Math.max(0, Math.min(100, progressXp))
    };
}

const DASHBOARD_ACTIVITY_KEY = 'chess_recent_activity';

function normalizeDashboardActivityEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const timestamp = Number(entry.timestamp || Date.parse(entry.createdAt || entry.time || ''));
    return {
        id: String(entry.id || `activity_${timestamp || Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
        type: String(entry.type || 'activity'),
        icon: String(entry.icon || '•'),
        title: String(entry.title || 'Activity'),
        detail: String(entry.detail || ''),
        xp: entry.xp ? String(entry.xp) : '',
        timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0,
        accent: String(entry.accent || 'blue')
    };
}

function getDashboardActivityLog() {
    const activeProfile = getActiveProfile();
    const stored = activeProfile && Array.isArray(activeProfile.activityLog)
        ? activeProfile.activityLog
        : readJsonStorage(DASHBOARD_ACTIVITY_KEY, []);
    return (Array.isArray(stored) ? stored : [])
        .map(normalizeDashboardActivityEntry)
        .filter(Boolean);
}

function recordChessSystemActivity(entry) {
    const normalized = normalizeDashboardActivityEntry({
        ...entry,
        timestamp: entry && entry.timestamp ? entry.timestamp : Date.now()
    });
    if (!normalized) return;
    const dedupeKey = [normalized.type, normalized.title, normalized.detail].join('|');
    const log = getDashboardActivityLog()
        .filter(activity => [activity.type, activity.title, activity.detail].join('|') !== dedupeKey);
    const nextLog = [normalized, ...log].slice(0, 50);
    localStorage.setItem(DASHBOARD_ACTIVITY_KEY, JSON.stringify(nextLog));
    updateActiveProfileProgress(profile => ({ ...profile, activityLog: nextLog }));
    renderDashboardHome();
}

window.recordChessSystemActivity = recordChessSystemActivity;

function formatCompactNumber(value) {
    const number = Number(value) || 0;
    return number.toLocaleString();
}

function formatRelativeTime(timestamp) {
    const time = Number(timestamp);
    if (!Number.isFinite(time) || time <= 0) return 'Recently';
    const diffMs = Date.now() - time;
    const absMs = Math.max(0, diffMs);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (absMs < hour) return `${Math.max(1, Math.floor(absMs / minute))}m ago`;
    if (absMs < day) return `${Math.floor(absMs / hour)}h ago`;
    if (absMs < day * 7) return `${Math.floor(absMs / day)}d ago`;
    return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDashboardDate(gameRecord) {
    const timestamp = getGamePlayedTime(gameRecord);
    if (!timestamp) return 'Unknown date';
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDashboardTrainingState() {
    const trainingProgress = getSharedTrainingProgress();
    const playerProfile = trainingProgress.playerProfile;
    const activeProfile = getActiveProfile();
    const weaknessProfile = (activeProfile && activeProfile.weaknessProfile) || readJsonStorage('training_weakness_profile', null);
    const completedPuzzleIds = Array.isArray(playerProfile.completedPuzzleIds) ? playerProfile.completedPuzzleIds : [];
    const totalXp = trainingProgress.totalXp;
    const currentStreak = Math.max(0, Math.floor(Number((activeProfile && activeProfile.streak) || playerProfile.currentStreak || 0) || 0));
    const puzzlesSolved = Math.max(0, Math.floor(Number(
        (activeProfile && activeProfile.puzzlesSolved)
        || completedPuzzleIds.length
        || playerProfile.totalPuzzlesSolved
        || playerProfile.totalCorrect
        || 0
    ) || 0));
    const gamesAnalyzed = Math.max(0, Math.floor(Number(
        (activeProfile && activeProfile.gamesAnalyzed)
        || getGamesAnalyzedFromWeaknessProfile(weaknessProfile)
        || 0
    ) || 0));
    const estimatedRating = Math.max(0, Math.floor(Number(
        (activeProfile && activeProfile.estimatedRating)
        || getEstimatedRatingFromWeaknessProfile(weaknessProfile)
        || 0
    ) || 0));

    return {
        playerProfile,
        weaknessProfile,
        puzzlesSolved,
        currentStreak,
        totalXp,
        level: trainingProgress.level,
        lockedBossLevel: trainingProgress.lockedBossLevel,
        progressXp: trainingProgress.progressXp,
        gamesAnalyzed,
        estimatedRating,
        lastPlayedAt: playerProfile.lastPlayedAt || null
    };
}

function getDashboardGameOutcome(gameRecord) {
    const chessComUsername = getChessComUsername();
    const localUsername = localStorage.getItem('chess_profile_username') || 'Chess Player';
    const userColor = getUserColorInGame(gameRecord, chessComUsername, localUsername) || 'white';
    const result = getGameResult(gameRecord);

    if (result === '1/2-1/2' || String(result).includes('1/2')) {
        return { code: 'D', className: 'draw', score: '1/2' };
    }
    if (result === '1-0') {
        return userColor === 'white'
            ? { code: 'W', className: 'win', score: '1-0' }
            : { code: 'L', className: 'loss', score: '0-1' };
    }
    if (result === '0-1') {
        return userColor === 'black'
            ? { code: 'W', className: 'win', score: '1-0' }
            : { code: 'L', className: 'loss', score: '0-1' };
    }
    return { code: '-', className: 'unknown', score: result || '*' };
}

function getDashboardGameMeta(gameRecord) {
    const chessCom = gameRecord && gameRecord.chessCom || {};
    const timeClass = chessCom.timeClass || chessCom.time_class || gameRecord.timeClass || 'Game';
    const rules = chessCom.rules && chessCom.rules !== 'chess' ? chessCom.rules : '';
    return [timeClass, rules].filter(Boolean).join(' · ');
}

function getRecentDashboardGames(limit = 5) {
    return (Array.isArray(savedGames) ? savedGames : [])
        .slice()
        .sort((a, b) => getGamePlayedTime(b) - getGamePlayedTime(a))
        .slice(0, limit);
}

function getDashboardBossName(level) {
    const bossNames = {
        '3': 'Tactics Goblin',
        '6': 'Endgame Titan',
        '9': 'Calculation Demon',
        '12': 'Defensive Fortress',
        '15': 'Fork Master',
        '18': 'Checkmate Dragon'
    };
    return bossNames[String(level)] || `Level ${level} Boss`;
}

function getDashboardRecentActivity(trainingState) {
    const syncedLevel = Math.max(1, Math.floor(Number(trainingState.level || 1) || 1));
    const activities = getDashboardActivityLog()
        .map(activity => {
            if (activity.type !== 'level-completed' && activity.type !== 'level-reached') return activity;
            return {
                ...activity,
                title: `Reached Level ${syncedLevel}`,
                detail: `${Math.max(0, syncedLevel - 1)} levels completed`
            };
        });

    const loggedKeys = new Set(activities.map(activity => [activity.type, activity.title, activity.detail].join('|')));
    Object.keys((trainingState.playerProfile && trainingState.playerProfile.bossesDefeated) || {}).forEach(level => {
        if (!trainingState.playerProfile.bossesDefeated[level]) return;
        const bossName = getDashboardBossName(level);
        const entry = {
            type: 'boss-defeated',
            icon: '♛',
            title: `Defeated ${bossName}`,
            detail: `Level ${level} boss cleared`,
            xp: '',
            timestamp: 0,
            accent: 'purple'
        };
        const key = [entry.type, entry.title, entry.detail].join('|');
        if (!loggedKeys.has(key)) activities.push(entry);
    });

    if (syncedLevel > 1) {
        const timestamp = Date.parse(trainingState.lastPlayedAt || '');
        activities.push({
            type: 'level-reached',
            icon: '★',
            title: `Reached Level ${syncedLevel}`,
            detail: `${Math.max(0, syncedLevel - 1)} levels completed`,
            xp: '',
            timestamp: Number.isFinite(timestamp) ? timestamp : 0,
            accent: 'yellow'
        });
    }

    getRecentDashboardGames(5).forEach(gameRecord => {
        const timestamp = getGamePlayedTime(gameRecord);
        activities.push({
            type: 'game-played',
            icon: '♞',
            title: 'Game played',
            detail: getGameTitle(gameRecord),
            xp: '',
            timestamp,
            accent: 'blue'
        });
    });

    return activities
        .map(activity => ({ ...activity, time: activity.timestamp ? formatRelativeTime(activity.timestamp) : 'Recorded' }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 4);
}

function ActionCard({ accent, icon, title, subtitle, description, button, action, piece }) {
    return `
        <article class="dashboard-action-card ${accent}" data-dashboard-action="${escapeHtml(action)}" tabindex="0" role="button" aria-label="${escapeHtml(button)}">
            <div class="dashboard-action-main">
                <div class="dashboard-action-icon" aria-hidden="true">${escapeHtml(icon)}</div>
                <div>
                    <h3>${escapeHtml(title)}</h3>
                    <p class="dashboard-action-subtitle">${escapeHtml(subtitle)}</p>
                </div>
                <p class="dashboard-action-description">${escapeHtml(description)}</p>
                <button class="dashboard-card-btn" type="button">${escapeHtml(button)}</button>
            </div>
            <div class="dashboard-action-piece" aria-hidden="true">${escapeHtml(piece)}</div>
        </article>
    `;
}

function ProgressStatCard({ icon, label, value, change, accent }) {
    return `
        <article class="dashboard-progress-card ${accent}">
            <div class="dashboard-progress-icon" aria-hidden="true">${escapeHtml(icon)}</div>
            <div>
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
                <small>${escapeHtml(change)}</small>
            </div>
        </article>
    `;
}

function RecentActivityCard(activities) {
    const rows = activities.length
        ? activities.map(activity => `
                    <div class="dashboard-activity-item">
                        <span class="dashboard-list-icon ${escapeHtml(activity.accent)}" aria-hidden="true">${escapeHtml(activity.icon)}</span>
                        <div>
                            <strong>${escapeHtml(activity.title)}</strong>
                            <small>${escapeHtml(activity.detail)}</small>
                        </div>
                        ${activity.xp ? `<span class="dashboard-xp">${escapeHtml(activity.xp)}</span>` : '<span class="dashboard-xp muted">--</span>'}
                        <time>${escapeHtml(activity.time)}</time>
                    </div>
                `).join('')
        : '<div class="dashboard-empty-row">No recent activity yet. Play games or complete Training Coach challenges to build your timeline.</div>';

    return `
        <section class="dashboard-card dashboard-list-card">
            <div class="dashboard-card-heading">
                <h2>Recent Activity</h2>
                <a href="/profile" data-route="/profile">View All →</a>
            </div>
            <div class="dashboard-activity-list">
                ${rows}
            </div>
        </section>
    `;
}

function RecentGamesCard(games) {
    const rows = games.length
        ? games.map(gameRecord => {
            const outcome = getDashboardGameOutcome(gameRecord);
            return `
                <button class="dashboard-game-row" type="button" data-dashboard-game-id="${escapeHtml(gameRecord.id)}">
                    <span class="dashboard-result-badge ${escapeHtml(outcome.className)}">${escapeHtml(outcome.code)}</span>
                    <span class="dashboard-game-main">
                        <strong>${escapeHtml(getGameTitle(gameRecord))}</strong>
                        <small>${escapeHtml(getDashboardGameMeta(gameRecord) || 'Saved game')}</small>
                    </span>
                    <time>${escapeHtml(formatDashboardDate(gameRecord))}</time>
                    <span class="dashboard-score">${escapeHtml(outcome.score)}</span>
                </button>
            `;
        }).join('')
        : '<div class="dashboard-empty-row">No saved games yet. Upload a PGN or connect Chess.com to start your library.</div>';

    return `
        <section class="dashboard-card dashboard-list-card">
            <div class="dashboard-card-heading">
                <h2>Recent Games</h2>
                <button type="button" class="dashboard-link-button" data-dashboard-action="show-library">View Full Games →</button>
            </div>
            <div class="dashboard-games-list">${rows}</div>
        </section>
    `;
}

function ChessComSyncStatus() {
    const username = getChessComUsername();
    const lastSyncRaw = localStorage.getItem('chess_com_last_sync_at');
    const lastSyncText = lastSyncRaw ? formatRelativeTime(new Date(lastSyncRaw).getTime()) : 'Not synced yet';

    if (username) {
        return `
            <section class="dashboard-sync-card connected">
                <div class="dashboard-sync-icon" aria-hidden="true">↻</div>
                <div>
                    <strong>Chess.com Sync</strong>
                    <span>Connected as: ${escapeHtml(username)}</span>
                    <small>Last sync: ${escapeHtml(lastSyncText)}</small>
                </div>
                <div class="dashboard-sync-message">
                    <strong>Your games are syncing in the background</strong>
                    <span>We will keep your library up to date automatically.</span>
                </div>
                <button type="button" class="secondary-btn dashboard-sync-btn" data-dashboard-action="manage-chesscom">Manage Connection</button>
            </section>
        `;
    }

    return `
        <section class="dashboard-sync-card">
            <div class="dashboard-sync-icon" aria-hidden="true">↻</div>
            <div>
                <strong>Chess.com Sync</strong>
                <span>Connect Chess.com to sync your games automatically</span>
                <small>Background sync is disabled</small>
            </div>
            <div class="dashboard-sync-message">
                <strong>Automatic game import is ready when you are.</strong>
                <span>Connect a public username to populate recent games and training insights.</span>
            </div>
            <button type="button" class="primary-btn dashboard-sync-btn" data-dashboard-action="manage-chesscom">Connect Chess.com</button>
        </section>
    `;
}

function DashboardHome() {
    const username = localStorage.getItem('chess_profile_username') || getChessComUsername() || 'Chess Player';
    const trainingState = getDashboardTrainingState();
    const recentGames = getRecentDashboardGames(5);
    const activities = getDashboardRecentActivity(trainingState);
    const analyzedCount = trainingState.gamesAnalyzed || 0;

    if (dashboardUsername) dashboardUsername.innerText = username;

    const progressCards = [
        { icon: '🎯', label: 'Puzzles Solved', value: formatCompactNumber(trainingState.puzzlesSolved || 0), change: trainingState.puzzlesSolved ? 'Saved to this account' : 'Start training today', accent: 'blue' },
        { icon: '🔥', label: 'Current Streak', value: String(trainingState.currentStreak || 0), change: trainingState.currentStreak ? 'Puzzle streak saved' : 'No streak yet', accent: 'orange' },
        { icon: '♟️', label: 'Current Level', value: `Level ${trainingState.level || 1}`, change: trainingState.lockedBossLevel ? 'Boss challenge required' : `${TRAINING_XP_PER_LEVEL - (trainingState.progressXp || 0)} XP to next`, accent: 'green' },
        { icon: '⭐️', label: 'Total XP', value: formatCompactNumber(trainingState.totalXp || 0), change: trainingState.totalXp ? '+320 this week' : 'Earn XP in puzzles', accent: 'yellow' },
        { icon: '🔬', label: 'Games Analyzed', value: formatCompactNumber(analyzedCount), change: analyzedCount ? 'From active profile' : 'Analyze a saved game', accent: 'purple' },
        { icon: '📈', label: 'Estimated Rating', value: trainingState.estimatedRating ? formatCompactNumber(trainingState.estimatedRating) : 'Not estimated', change: trainingState.estimatedRating ? 'From game analysis' : 'Analyze games to estimate', accent: 'gold' }
    ];

    return `
        <section class="dashboard-actions-grid">
            ${ActionCard({
                accent: 'purple',
                icon: '🧩',
                title: 'Training Coach',
                subtitle: 'Sharpen your tactics',
                description: 'Practice puzzles tailored to your level and improve your tactical vision.',
                button: 'Start Training →',
                action: 'training',
                piece: '♟'
            })}
            ${ActionCard({
                accent: 'green',
                icon: '📖',
                title: 'Chess Coach',
                subtitle: 'Learn & understand',
                description: 'Master openings, strategies, and key concepts with guided lessons.',
                button: 'Start Learning →',
                action: 'coach',
                piece: '♞'
            })}
            ${ActionCard({
                accent: 'blue',
                icon: '🔎',
                title: 'Analyze Games',
                subtitle: 'Review & improve',
                description: 'Analyze your past games to find mistakes, patterns, and improvement areas.',
                button: 'Analyze Games →',
                action: 'show-library',
                piece: '♜'
            })}
        </section>

        <section class="dashboard-card dashboard-progress-section">
            <div class="dashboard-card-heading">
                <h2>Your Progress</h2>
                <a href="/profile" data-route="/profile">View Full Stats →</a>
            </div>
            <div class="dashboard-progress-grid">
                ${progressCards.map(ProgressStatCard).join('')}
            </div>
        </section>

        <div class="dashboard-lower-grid">
            ${RecentActivityCard(activities)}
            ${RecentGamesCard(recentGames)}
        </div>

        ${ChessComSyncStatus()}
    `;
}

function renderDashboardHome() {
    if (!dashboardHome) return;
    dashboardHome.innerHTML = DashboardHome();
}

function showDashboardGameLibrary() {
    if (!fullGameLibrarySection) return;
    fullGameLibrarySection.hidden = false;
    fullGameLibrarySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideDashboardGameLibrary() {
    if (!fullGameLibrarySection) return;
    fullGameLibrarySection.hidden = true;
}

function renderGameLibrary() {
    renderDashboardHome();
    gameLibrary.innerHTML = '';
    
    if (savedGames.length === 0) {
        gameLibrary.innerHTML = fileStoreUnavailable
            ? '<div class="empty-state error-text">Local game storage is offline. Start the backend with <code>npm run backend</code> so games can be saved and compressed on disk.</div>'
            : '<div class="empty-state">No saved games yet. Upload a PGN to get started.</div>';
        currentSortLabel.parentElement.style.display = 'none';
        return;
    }

    currentSortLabel.parentElement.style.display = 'block';

    // Update label
    const sortNames = { 'alpha': 'Alphabetical Order', 'time': 'Time Added', 'winner': 'Winner' };
    currentSortLabel.innerText = `Sorted by: ${sortNames[currentSort] || 'Winner'}`;

    // Update active class in dropdown
    document.querySelectorAll('.sort-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.sort === currentSort);
    });

    let gamesCopy = [...savedGames];

    try {
        if (currentSort === 'alpha') {
            gamesCopy.sort((a, b) => getGameTitle(a).toLowerCase().localeCompare(getGameTitle(b).toLowerCase()));
            renderGameList(gamesCopy);
        } else if (currentSort === 'time') {
            gamesCopy.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            renderGameList(gamesCopy);
        } else if (currentSort === 'winner') {
            renderWinnerGroupedGames(gamesCopy);
        } else {
            currentSort = 'winner';
            localStorage.setItem('chess_current_sort', currentSort);
            renderWinnerGroupedGames(gamesCopy);
        }
    } catch (err) {
        console.error("Sorting/Rendering Error:", err);
        // Fallback to simple list if sort fails
        renderGameList(savedGames);
    }
}

function renderGameList(games) {
    games.forEach(g => {
        const card = createGameCard(g);
        if (card) gameLibrary.appendChild(card);
    });
}

function renderWinnerGroupedGames(games) {
    const groups = {
        'white': { title: 'White Won', games: [] },
        'black': { title: 'Black Won', games: [] },
        'drawn': { title: 'Drawn', games: [] },
        'unknown': { title: 'Unknown / Ongoing', games: [] }
    };

    games.forEach(g => {
        const cat = getWinnerCategory(g);
        if (groups[cat]) {
            groups[cat].games.push(g);
        } else {
            groups['unknown'].games.push(g);
        }
    });

    ['white', 'black', 'drawn', 'unknown'].forEach(key => {
        const group = groups[key];
        if (group.games.length > 0) {
            const heading = document.createElement('div');
            heading.className = 'winner-heading';
            heading.innerHTML = `
                <span>${group.title}</span>
                <span class="winner-heading-count">${group.games.length} game${group.games.length === 1 ? '' : 's'}</span>
            `;
            gameLibrary.appendChild(heading);

            const recentGames = group.games
                .slice()
                .sort((a, b) => getGameCreatedTime(b) - getGameCreatedTime(a))
                .slice(0, 10);

            recentGames.forEach(g => {
                const card = createGameCard(g);
                if (card) gameLibrary.appendChild(card);
            });

            if (group.games.length > 10) {
                const viewMore = document.createElement('button');
                viewMore.className = 'winner-view-more secondary-btn';
                viewMore.innerText = `View more ${group.title.toLowerCase()} games`;
                viewMore.addEventListener('click', () => showWinnerGroupView(key));
                gameLibrary.appendChild(viewMore);
            }
        }
    });
}

function showWinnerGroupView(category) {
    activeWinnerGroupCategory = category;
    const groups = {
        'white': { title: 'White Won', games: [] },
        'black': { title: 'Black Won', games: [] },
        'drawn': { title: 'Drawn', games: [] },
        'unknown': { title: 'Unknown / Ongoing', games: [] }
    };
    const group = groups[category] || groups.unknown;

    savedGames.forEach(g => {
        if (getWinnerCategory(g) === category) group.games.push(g);
    });

    group.games.sort((a, b) => getGameCreatedTime(b) - getGameCreatedTime(a));

    homeView.style.display = 'none';
    if (winnerGroupView) winnerGroupView.style.display = 'block';
    analysisView.style.display = 'none';
    createGameView.style.display = 'none';
    playComputerView.style.display = 'none';
    if (trainingCoachView) trainingCoachView.style.display = 'none';
    chessCoachView.style.display = 'none';

    if (winnerGroupTitle) {
        winnerGroupTitle.innerText = `${group.title} (${group.games.length})`;
    }
    if (!winnerGroupLibrary) return;

    winnerGroupLibrary.innerHTML = '';
    if (group.games.length === 0) {
        winnerGroupLibrary.innerHTML = '<div class="empty-state">No games to show.</div>';
        return;
    }

    group.games.forEach(g => {
        const card = createGameCard(g);
        if (card) winnerGroupLibrary.appendChild(card);
    });
}

function createGameCard(g) {
    if (!g) return null;
    
    const title = getGameTitle(g);
    const white = (g.headers && g.headers.White) || g.white || 'Unknown White';
    const black = (g.headers && g.headers.Black) || g.black || 'Unknown Black';
    const date = (g.headers && g.headers.Date) || g.date || 'Unknown Date';
    const result = getGameResult(g);
    const moveCount = g.moveCount || (g.isMetadataOnly ? '--' : 0);
    const chessComMeta = g.chessCom || (g.gameMetadata && g.gameMetadata.source === 'chess.com' ? g.gameMetadata : null);
    const gameTypeLabel = chessComMeta
        ? `Chess.com${chessComMeta.userColor ? ` (${chessComMeta.userColor})` : ''}`
        : ((g.headers && g.headers.Event === 'Computer Game') ? 'vs Computer' : 'PGN Game');
    
    const card = document.createElement('div');
    card.className = 'game-card';
    card.onclick = () => openGameFromLibrary(g);
    
    card.innerHTML = `
        <div class="game-card-header">
            <div class="game-card-players">${title}</div>
            <div class="game-card-result">${result}</div>
        </div>
        <div class="game-card-meta">
            <span><strong>Players:</strong> ${white} vs ${black}</span>
            <span><strong>Date:</strong> ${date}</span>
            <span><strong>Moves:</strong> ${moveCount}</span>
        </div>
        <div class="game-card-footer">
            <span class="game-type-label">${gameTypeLabel}</span>
            <button class="btn-delete" title="Delete Game">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                    <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                </svg>
            </button>
        </div>
    `;
    
    const deleteBtn = card.querySelector('.btn-delete');
    if (deleteBtn) {
        deleteBtn.onclick = (e) => deleteGame(g.id, e);
    }
    return card;
}

// --- PGN Handling ---

pgnInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.pgn')) {
        alert("Please upload a valid .pgn file.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const pgnText = e.target.result;
        const savedGame = await saveGameToStorage(pgnText);
        if (savedGame) {
            navigateToRoute(`/game/${encodeURIComponent(savedGame.id)}`);
        }
        // Clear input so same file can be uploaded again if deleted
        pgnInput.value = '';
    };
    reader.readAsText(file);
});

function loadPGN(pgnText, shouldSave = false, aiText = null) {
    game = new Chess();
    if (!pgnText) {
        alert("This game's PGN could not be loaded.");
        moveListContainer.innerHTML = '<div class="empty-state error-text">Failed to load PGN.</div>';
        return;
    }
    if (rawPgnText) rawPgnText.value = pgnText;
    const loaded = game.load_pgn(pgnText);
    
    if (!loaded) {
        alert("Error parsing PGN file.");
        moveListContainer.innerHTML = '<div class="empty-state error-text">Failed to parse PGN.</div>';
        return;
    }

    let displayAiText = aiText;
    if (displayAiText && aiTextNeedsFenUpgrade(displayAiText)) {
        const upgraded = upgradeAiTextFormatWithFens(displayAiText);
        if (upgraded) displayAiText = upgraded;
    }
    if (!displayAiText) {
        displayAiText = convertPgnToAiTextFormat(pgnText) || '';
    }
    if (aiTextFormat) aiTextFormat.value = displayAiText || '';
    buildGameHistory();
    
    currentMoveIndex = -1;
    updateBoard();
    renderMoveList();
    
    // Clear chat history for new game
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = `
        <div class="message assistant">
            Hello! I am your AI Chess Assistant. I've loaded the game between ${game.header().White || 'White'} and ${game.header().Black || 'Black'}.
        </div>
    `;
}

function buildGameHistory() {
    const moves = game.history({ verbose: true });
    const tempGame = new Chess();
    gameHistory = [];
    
    for (let i = 0; i < moves.length; i++) {
        tempGame.move(moves[i].san);
        gameHistory.push({
            san: moves[i].san,
            fen: tempGame.fen()
        });
    }
}

function renderMoveList() {
    moveListContainer.innerHTML = '';
    
    if (gameHistory.length === 0) {
        moveListContainer.innerHTML = '<div class="empty-state">No moves found in PGN.</div>';
        return;
    }

    let currentPair = null;

    for (let i = 0; i < gameHistory.length; i++) {
        if (i % 2 === 0) {
            currentPair = document.createElement('div');
            currentPair.className = 'move-pair';
            
            const moveNum = document.createElement('div');
            moveNum.className = 'move-number';
            moveNum.innerText = `${Math.floor(i / 2) + 1}.`;
            currentPair.appendChild(moveNum);
            
            moveListContainer.appendChild(currentPair);
        }

        const moveItem = document.createElement('div');
        moveItem.className = 'move-item';
        moveItem.innerText = gameHistory[i].san;
        moveItem.dataset.index = i;
        moveItem.id = `move-${i}`;
        
        moveItem.addEventListener('click', () => goToMove(i));
        currentPair.appendChild(moveItem);
    }
}

function goToMove(index) {
    if (index < -1 || index >= gameHistory.length) return;
    currentMoveIndex = index;
    updateBoard();
    updateNavigationButtons();
}

function updateBoard() {
    if (currentMoveIndex === -1) {
        board.position('start');
    } else {
        board.position(gameHistory[currentMoveIndex].fen);
    }

    const allMoves = document.querySelectorAll('.move-item');
    allMoves.forEach(m => m.classList.remove('active'));
    
    if (currentMoveIndex !== -1) {
        const activeMove = document.getElementById(`move-${currentMoveIndex}`);
        if (activeMove) {
            activeMove.classList.add('active');
            activeMove.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// Sort Event Listeners
if (sortBtn && sortDropdown) {
    sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = sortDropdown.style.display === 'block';
        sortDropdown.style.display = isVisible ? 'none' : 'block';
    });
}

document.addEventListener('click', () => {
    if (sortDropdown) sortDropdown.style.display = 'none';
});

document.querySelectorAll('.sort-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
        currentSort = e.target.dataset.sort;
        localStorage.setItem('chess_current_sort', currentSort);
        renderGameLibrary();
    });
});

// --- Chat Classification & Evidence Retrieval ---


// Navigation Listeners
document.getElementById('btnStart').addEventListener('click', () => goToMove(-1));
document.getElementById('btnEnd').addEventListener('click', () => goToMove(gameHistory.length - 1));
document.getElementById('btnPrev').addEventListener('click', () => goToMove(currentMoveIndex - 1));
document.getElementById('btnNext').addEventListener('click', () => goToMove(currentMoveIndex + 1));

document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') goToMove(currentMoveIndex - 1);
    else if (e.key === 'ArrowRight') goToMove(currentMoveIndex + 1);
});

function updateNavigationButtons() {
    const btnStart = document.getElementById('btnStart');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const btnEnd = document.getElementById('btnEnd');
    
    btnStart.disabled = currentMoveIndex === -1;
    btnPrev.disabled = currentMoveIndex === -1;
    btnNext.disabled = currentMoveIndex === gameHistory.length - 1 || gameHistory.length === 0;
    btnEnd.disabled = currentMoveIndex === gameHistory.length - 1 || gameHistory.length === 0;
}

// --- Chat Functionality ---
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');

// Navigation Listeners



async function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    addChatMessage(message, 'user');
    chatInput.value = '';

    const loadingMsgId = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.id = loadingMsgId;
    loadingDiv.innerText = 'Thinking...';
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        const stockfishRequested = /\b(stockfish|engine|eval(?:uation)?|best move|accuracy|blunder|centipawn)\b/i.test(message);
        const stockfishMode = stockfishRequested ? 'analysis' : 'none';
        const headers = game ? game.header() : {};
        const gameMetadata = {
            ...(currentLoadedGame && currentLoadedGame.gameMetadata ? currentLoadedGame.gameMetadata : {}),
            source: (currentLoadedGame && currentLoadedGame.source) || (currentLoadedGame && currentLoadedGame.gameMetadata && currentLoadedGame.gameMetadata.source) || null,
            chessCom: currentLoadedGame && currentLoadedGame.chessCom ? currentLoadedGame.chessCom : null,
            headers,
            title: currentLoadedGame ? getGameTitle(currentLoadedGame) : (headers.Event || null),
            result: headers.Result || (currentLoadedGame ? getGameResult(currentLoadedGame) : '*')
        };

        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message, 
                fen: game ? game.fen() : 'start',
                selectedMove: (currentMoveIndex !== -1 && gameHistory[currentMoveIndex]) ? gameHistory[currentMoveIndex].san : null,
                aiTextFormat: buildAnalystAiTextForRequest(aiTextFormat ? aiTextFormat.value : ''),
                fenReadingGuide: ANALYST_FEN_READING_GUIDE,
                causalExplanationGuide: ANALYST_CAUSAL_EXPLANATION_GUIDE,
                gameMetadata,
                stockfishRequested,
                stockfishMode,
                proficiencyLevel: getChessSkillLevel() || null
            })
        });
        
        const loadingEl = document.getElementById(loadingMsgId);
        if (loadingEl) loadingEl.remove();

        const data = await response.json();
        if (!response.ok) {
            addChatMessage(data.error || 'Error from server', 'assistant');
        } else {
            addChatMessage(data.reply || 'No response.', 'assistant');
        }
    } catch (error) {
        const loadingEl = document.getElementById(loadingMsgId);
        if (loadingEl) loadingEl.remove();
        addChatMessage('Error: Could not connect to chat server.', 'assistant');
    }
    
    sendBtn.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
}

function addChatMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

sendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
});

// --- Chess Coach Chat Functionality ---
function formatMarkdown(text) {
    if (!text) return '';
    let html = text.replace(/^### (.*$)/gim, '<h3>$1</h3>')
                   .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                   .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                   .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
                   .replace(/\*(.*)\*/gim, '<em>$1</em>')
                   .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Handle lists
    html = html.replace(/^\s*\-\s(.*)$/gim, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\n<ul>/gim, '');
    
    // Add simple line breaks
    html = html.replace(/\n/g, '<br/>');
    
    return html;
}

async function sendCoachMessage() {
    const message = coachChatInput.value.trim();
    if (!message) return;

    // 1. If awaiting skill level answer, parse locally — do NOT send to AI
    if (_awaitingSkillLevel) {
        addCoachMessage(message, 'user');
        coachChatInput.value = '';
        const level = parseSkillLevelInput(message);
        if (level) {
            setChessSkillLevel(level);
            _awaitingSkillLevel = false;
            updateSkillLevelBadge();
            addCoachMessage(getSkillLevelConfirmation(level), 'assistant');
        } else {
            addCoachMessage('Please choose beginner, intermediate, or advanced.', 'assistant');
        }
        return;
    }

    // 2. Natural level change ("set my level to beginner", "change my level", "set level")
    const levelChange = detectNaturalLevelChange(message);
    if (levelChange) {
        addCoachMessage(message, 'user');
        coachChatInput.value = '';
        if (levelChange === 'reset') {
            localStorage.removeItem(SKILL_LEVEL_KEY);
            _awaitingSkillLevel = true;
            updateSkillLevelBadge();
            addCoachMessage(SKILL_LEVEL_ASK_MSG, 'assistant');
        } else {
            setChessSkillLevel(levelChange);
            updateSkillLevelBadge();
            addCoachMessage(getSkillLevelConfirmation(levelChange), 'assistant');
        }
        return;
    }

    // 3. Simplify / deepen
    const sd = detectSimplifyOrDeepen(message);
    if (sd && _lastCoachAnswer) {
        addCoachMessage(message, 'user');
        coachChatInput.value = '';
        const lvl = getChessSkillLevel() || 'intermediate';
        const followUp = sd === 'simpler'
            ? `Please re-explain the following in simpler terms suitable for a beginner:\n\n${_lastCoachAnswer}`
            : `Please go deeper with more advanced detail, variations, and strategic depth:\n\n${_lastCoachAnswer}`;
        await sendCoachToBackend(followUp, lvl);
        return;
    }

    // 4. Normal flow — send to AI with saved skill level
    addCoachMessage(message, 'user');
    coachChatInput.value = '';
    await sendCoachToBackend(message, getChessSkillLevel() || 'intermediate');
}

async function sendCoachToBackend(message, proficiencyLevel) {
    const loadingMsgId = 'loading-coach-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.id = loadingMsgId;
    loadingDiv.innerText = 'Thinking...';
    coachChatMessages.appendChild(loadingDiv);
    coachChatMessages.scrollTop = coachChatMessages.scrollHeight;

    try {
        const response = await fetch(`${API_BASE}/coach`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, proficiencyLevel: proficiencyLevel || 'intermediate' })
        });
        
        const loadingEl = document.getElementById(loadingMsgId);
        if (loadingEl) loadingEl.remove();

        const data = await response.json();
        if (!response.ok) {
            addCoachMessage(data.error || 'Error from server', 'assistant');
        } else {
            foundVariations.innerHTML = '';
            variationCount.innerText = '0';

            const answer = data.answer || 'No response.';
            const openingLines = data.openingLines || [];
            const classification = data.classification || {};
            const pType = classification.primaryType || 'general';
            
            _lastCoachAnswer = answer;
            addCoachMessage(answer, 'assistant', true, true);
            
            console.log(`[OpeningLinesDebug:Frontend] full response:`, data);
            console.log(`[OpeningLinesDebug:Frontend] openingLines received:`, openingLines ? openingLines.length : 0);
            
            if (pType === 'opening') {
                let finalOpeningLines = openingLines;
                if (finalOpeningLines.length === 0 && data.evidenceUsed) {
                    const evidenceWithMoves = data.evidenceUsed.filter(ev => ev.category === 'opening' && ev.moves);
                    if (evidenceWithMoves.length > 0) {
                        console.warn(`[ChessCoachOpeningExplorer] WARNING: Falling back to evidenceUsed.`);
                        finalOpeningLines = buildOpeningLinesFromEvidence(evidenceWithMoves);
                    }
                }
                console.log(`[OpeningLinesDebug:Frontend] openingLines state after set:`, finalOpeningLines.length);
                renderOpeningLines(finalOpeningLines, data.relatedLines);
                const evidenceIds = data.evidenceUsed ? data.evidenceUsed.map(e => e.sourceId) : [];
                const linesWithMoves = [];
                finalOpeningLines.forEach(o => o.groups.forEach(g => g.lines.forEach(l => linesWithMoves.push(l))));
                const lineIds = linesWithMoves.map(l => l.sourceId);
                console.log(`[ChessCoachAnswer] Context source IDs:`, evidenceIds);
                console.log(`[ChessCoachOpeningExplorer] Opening lines source IDs:`, lineIds);
                const allInEvidence = lineIds.every(id => evidenceIds.includes(id));
                console.log(`[ChessCoachOpeningExplorer] Lines generated from same evidence: ${allInEvidence}`);
                if (finalOpeningLines.length > 0 && finalOpeningLines[0].groups.length > 0 && finalOpeningLines[0].groups[0].lines.length > 0) {
                    loadVariationToBoard(finalOpeningLines[0].groups[0].lines[0]);
                }
            } else {
                foundVariations.innerHTML = '<div class="empty-state">No opening lines found for this query.</div>';
            }
            const debugPanel = document.getElementById('coach-debug-panel');
            if (debugPanel) {
                document.getElementById('debug-primary-type').innerText = pType;
                document.getElementById('debug-evidence-count').innerText = data.evidenceUsed ? data.evidenceUsed.length : 0;
                document.getElementById('debug-opening-count').innerText = openingLines ? openingLines.length : 0;
                document.getElementById('debug-json-preview').innerText = openingLines && openingLines.length > 0 ? JSON.stringify(openingLines[0], null, 2) : 'None';
            }
        }
    } catch (error) {
        const loadingEl = document.getElementById(loadingMsgId);
        if (loadingEl) loadingEl.remove();
        addCoachMessage('Error: Could not connect to coach server.', 'assistant');
    }
    
    sendCoachBtn.disabled = false;
    coachChatInput.disabled = false;
    coachChatInput.focus();
}

function renderOpeningLines(openings, relatedOpenings) {
    foundVariations.innerHTML = '';
    let totalLines = 0;
    
    if (openings.length === 0 && (!relatedOpenings || relatedOpenings.length === 0)) {
        foundVariations.innerHTML = '<div class="empty-state">No relevant opening lines found.</div>';
        variationCount.innerText = '0';
        return;
    }

    // Apply semicolon sorting: no-semicolon items first
    // Note: We also check for colons as they are common in the database, 
    // ensuring the "Main Line" entries (usually without separators) appear at the top.
    const sortFn = (a, b) => {
        const titleA = a.openingName || "";
        const titleB = b.openingName || "";
        const hasA = titleA.includes(';') || titleA.includes(':');
        const hasB = titleB.includes(';') || titleB.includes(':');
        if (hasA && !hasB) return 1;
        if (!hasA && hasB) return -1;
        return 0;
    };
    
    openings.sort(sortFn);
    if (relatedOpenings) relatedOpenings.sort(sortFn);
    
    console.log("[ChessCoachOpeningExplorer] Applied semicolon sorting: no-semicolon items first");

    // Render Main Openings
    openings.forEach(opening => {
        const openingEl = document.createElement('div');
        openingEl.className = 'opening-family-section';
        openingEl.innerHTML = `<div class="opening-family-header">${opening.openingName}</div>`;
        
        opening.groups.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = `opening-group ${group.groupType}`;
            groupEl.innerHTML = `<div class="opening-group-header">${group.groupTitle}</div>`;
            
            group.lines.forEach(line => {
                totalLines++;
                const card = createVariationCard(line);
                groupEl.appendChild(card);
            });
            openingEl.appendChild(groupEl);
        });
        foundVariations.appendChild(openingEl);
    });

    // Render Related Lines (if any)
    if (relatedOpenings && relatedOpenings.length > 0) {
        const relatedSection = document.createElement('div');
        relatedSection.className = 'related-lines-section';
        const relatedCount = relatedOpenings.reduce((acc, o) => acc + o.groups.reduce((g_acc, g) => g_acc + g.lines.length, 0), 0);
        
        relatedSection.innerHTML = `
            <div class="related-header" onclick="this.parentElement.classList.toggle('expanded')">
                <span>Related Lines (${relatedCount})</span>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="related-content"></div>
        `;
        const content = relatedSection.querySelector('.related-content');
        
        relatedOpenings.forEach(opening => {
            const openingEl = document.createElement('div');
            openingEl.className = 'opening-family-section related';
            openingEl.innerHTML = `<div class="opening-family-header">${opening.openingName} (Related)</div>`;
            
            opening.groups.forEach(group => {
                const groupEl = document.createElement('div');
                groupEl.className = 'opening-group related';
                groupEl.innerHTML = `<div class="opening-group-header">${group.groupTitle}</div>`;
                group.lines.forEach(line => {
                    const card = createVariationCard(line);
                    groupEl.appendChild(card);
                });
                openingEl.appendChild(groupEl);
            });
            content.appendChild(openingEl);
        });
        foundVariations.appendChild(relatedSection);
    }

    variationCount.innerText = totalLines;
}

function buildOpeningLinesFromEvidence(evidence) {
    const openingMap = {};
    evidence.forEach(ev => {
        const oName = ev.openingName;
        const vName = ev.variationName;
        const isMain = vName === "None" || vName === "" || !vName || vName.toLowerCase() === oName.toLowerCase();
        const groupTitle = isMain ? "Main Line" : vName;
        
        if (!openingMap[oName]) openingMap[oName] = {};
        if (!openingMap[oName][groupTitle]) {
            openingMap[oName][groupTitle] = {
                groupType: isMain ? "main_line" : "named_variation",
                groupTitle: groupTitle,
                lines: []
            };
        }
        
        openingMap[oName][groupTitle].lines.push({
            displayTitle: isMain ? `${oName} Main Line` : vName,
            openingName: oName,
            variationName: vName,
            lineType: isMain ? "main_line" : "named_variation",
            moves: ev.moves,
            eco: ev.eco,
            sourceId: ev.sourceId,
            score: ev.score,
            usedInAnswer: true
        });
    });
    
    return Object.keys(openingMap).map(oName => ({
        openingName: oName,
        groups: Object.values(openingMap[oName])
    }));
}

function createVariationCard(v) {
    const card = document.createElement('div');
    card.className = 'variation-card';
    card.innerHTML = `
        <div class="variation-card-header">
            <div class="variation-name">${v.displayTitle}</div>
            ${v.eco ? `<div class="variation-eco">${v.eco}</div>` : ''}
        </div>
        <div class="variation-moves">${v.moves || 'No moves available'}</div>
        <div class="variation-score">Relevance: ${Math.round(v.score * 100)}%</div>
    `;
    
    card.addEventListener('click', () => {
        document.querySelectorAll('.variation-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        loadVariationToBoard(v);
    });
    
    return card;
}

function loadVariationToBoard(v) {
    if (!v.moves) {
        console.warn(`[ChessCoachOpeningExplorer] No moves for variation: ${v.name}`);
        return;
    }

    console.log(`[ChessCoachOpeningExplorer] Variation loaded: ${v.name}`);
    
    const tempGame = new Chess();
    const moves = v.moves.split(' ');
    let parseErrors = 0;
    let movesParsed = 0;
    
    coachHistory = [];
    
    // Attempt to play moves. They might be in a string like "1. e4 e5 2. Nf3"
    // We'll try to extract the SAN parts.
    const sanMoves = v.moves.replace(/\d+\.+\s*/g, '').split(/\s+/);
    
    for (const move of sanMoves) {
        if (!move.trim()) continue;
        const result = tempGame.move(move);
        if (result) {
            movesParsed++;
            coachHistory.push({
                san: result.san,
                fen: tempGame.fen()
            });
        } else {
            parseErrors++;
        }
    }

    console.log(`[ChessCoachOpeningExplorer] Moves parsed: ${movesParsed}`);
    console.log(`[ChessCoachOpeningExplorer] Parse errors: ${parseErrors}`);

    if (movesParsed === 0 && sanMoves.length > 0) {
        // Show a warning on the card if possible
        const activeCard = document.querySelector('.variation-card.active');
        if (activeCard && !activeCard.querySelector('.variation-warning')) {
            const warning = document.createElement('div');
            warning.className = 'variation-warning';
            warning.innerText = 'Move line unavailable or could not be parsed.';
            activeCard.appendChild(warning);
        }
    }

    // Render move list for the variation
    renderCoachMoveList();
    
    // Set to final position
    goCoachToMove(coachHistory.length - 1);
}

function renderCoachMoveList() {
    coachMoveList.innerHTML = '';
    if (coachHistory.length === 0) {
        coachMoveList.innerHTML = '<div class="empty-state">No moves to display.</div>';
        return;
    }

    let currentPair = null;
    for (let i = 0; i < coachHistory.length; i++) {
        if (i % 2 === 0) {
            currentPair = document.createElement('div');
            currentPair.className = 'move-pair';
            const moveNum = document.createElement('div');
            moveNum.className = 'move-number';
            moveNum.innerText = `${Math.floor(i / 2) + 1}.`;
            currentPair.appendChild(moveNum);
            coachMoveList.appendChild(currentPair);
        }

        const moveItem = document.createElement('div');
        moveItem.className = 'move-item';
        moveItem.innerText = coachHistory[i].san;
        moveItem.dataset.index = i;
        moveItem.addEventListener('click', () => goCoachToMove(i));
        currentPair.appendChild(moveItem);
    }
}

function addCoachMessage(text, sender, isMarkdown = false, showQuickActions = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    if (isMarkdown) {
        msgDiv.innerHTML = formatMarkdown(text);
    } else {
        msgDiv.innerText = text;
    }
    if (showQuickActions && sender === 'assistant') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'chat-quick-actions';
        const simplerBtn = document.createElement('button');
        simplerBtn.className = 'chat-quick-action-btn';
        simplerBtn.innerText = '💡 Explain simpler';
        simplerBtn.addEventListener('click', () => { coachChatInput.value = 'Explain simpler'; sendCoachMessage(); });
        const deeperBtn = document.createElement('button');
        deeperBtn.className = 'chat-quick-action-btn';
        deeperBtn.innerText = '🔬 Go deeper';
        deeperBtn.addEventListener('click', () => { coachChatInput.value = 'Go deeper'; sendCoachMessage(); });
        actionsDiv.appendChild(simplerBtn);
        actionsDiv.appendChild(deeperBtn);
        msgDiv.appendChild(actionsDiv);
    }
    coachChatMessages.appendChild(msgDiv);
    coachChatMessages.scrollTop = coachChatMessages.scrollHeight;
}

sendCoachBtn.addEventListener('click', sendCoachMessage);
coachChatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendCoachMessage();
    }
});

// Initialize on load
window.addEventListener('popstate', () => {
    applyAppRoute();
});
window.addEventListener('chessforge:privacy-changed', () => {
    if (isChessComPrivacyAllowed()) startBackgroundChessComSync();
    else disableChessComBackgroundSync();
    renderProfileMenuState();
});

renderDashboardHome();
renderProfileMenuState();

window.onload = async () => {
    initBoard();
    await loadSavedGames();
    renderProfileMenuState();
    await applyAppRoute();
    startBackgroundChessComSync();
};
