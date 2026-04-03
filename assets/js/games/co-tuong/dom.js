export function getCoTuongElements() {
  return {
    connectingOverlay: document.getElementById('connectingOverlay'),

    // Mode select screen
    modeScreen: document.getElementById('modeScreen'),
    btnPlayAi: document.getElementById('btnPlayAi'),
    btnPlayOnline: document.getElementById('btnPlayOnline'),

    // AI setup modal
    aiSetupModal: document.getElementById('aiSetupModal'),
    btnCloseAiModal: document.getElementById('btnCloseAiModal'),
    difficultyBtns: document.querySelectorAll('.difficulty-btn'),
    sideBtns: document.querySelectorAll('.side-btn'),
    btnStartAi: document.getElementById('btnStartAi'),

    // Lobby screen
    lobbyScreen: document.getElementById('lobbyScreen'),
    lobbyNameStep: document.getElementById('lobbyNameStep'),
    lobbyWaitStep: document.getElementById('lobbyWaitStep'),
    onlineNameInput: document.getElementById('onlineName'),
    btnCreateRoom: document.getElementById('btnCreateRoom'),
    btnShowJoin: document.getElementById('btnShowJoin'),
    joinRoomGroup: document.getElementById('joinRoomGroup'),
    roomCodeInput: document.getElementById('roomCodeInput'),
    btnJoinRoom: document.getElementById('btnJoinRoom'),
    lobbyStatus: document.getElementById('lobbyStatus'),
    roomCodeText: document.getElementById('roomCodeText'),
    btnCopyCode: document.getElementById('btnCopyCode'),
    lobbyPlayerList: document.getElementById('lobbyPlayerList'),
    playerCountLabel: document.getElementById('playerCountLabel'),
    lobbyWaitStatus: document.getElementById('lobbyWaitStatus'),
    btnStartOnline: document.getElementById('btnStartOnline'),
    btnLeaveLobby: document.getElementById('btnLeaveLobby'),
    waitHostMessage: document.getElementById('waitHostMessage'),

    // Play screen
    playScreen: document.getElementById('playScreen'),
    roomBadge: document.getElementById('roomBadge'),
    turnIndicator: document.getElementById('turnIndicator'),
    timerRing: document.getElementById('timerRing'),
    timerText: document.getElementById('timerText'),
    redTimeEl: document.getElementById('redTime'),
    blackTimeEl: document.getElementById('blackTime'),
    redNameEl: document.getElementById('redName'),
    blackNameEl: document.getElementById('blackName'),
    boardContainer: document.getElementById('ctBoard'),
    capturedRedEl: document.getElementById('capturedRed'),
    capturedBlackEl: document.getElementById('capturedBlack'),
    btnResign: document.getElementById('btnResign'),
    historyLog: document.getElementById('historyLog'),

    // Game over screen
    gameOverScreen: document.getElementById('gameOverScreen'),
    winnerMessage: document.getElementById('winnerMessage'),
    btnRestart: document.getElementById('btnRestart'),

    // Misc
    langToggleBtn: document.getElementById('langToggle')
  };
}
