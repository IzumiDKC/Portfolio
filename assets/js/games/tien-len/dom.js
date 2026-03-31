export function getTienLenElements(documentRef = document) {
  return {
    screens: {
      lobby: documentRef.getElementById('lobbyScreen'),
      play: documentRef.getElementById('playScreen'),
      gameOver: documentRef.getElementById('gameOverScreen')
    },
    lobbySteps: {
      name: documentRef.getElementById('lobbyNameStep'),
      wait: documentRef.getElementById('lobbyWaitStep')
    },
    onlineName: documentRef.getElementById('onlineName'),
    joinRoomGroup: documentRef.getElementById('joinRoomGroup'),
    roomCodeInput: documentRef.getElementById('roomCodeInput'),
    roomCodeText: documentRef.getElementById('roomCodeText'),
    lobbyStatus: documentRef.getElementById('lobbyStatus'),
    lobbyPlayerList: documentRef.getElementById('lobbyPlayerList'),
    playerCountLabel: documentRef.getElementById('playerCountLabel'),
    lobbyHistory: documentRef.getElementById('lobbyHistory'),
    historyWinnerList: documentRef.getElementById('historyWinnerList'),
    btnStartOnline: documentRef.getElementById('btnStartOnline'),
    waitHostMessage: documentRef.getElementById('waitHostMessage'),
    historyLog: documentRef.getElementById('historyLog'),
    playedCardsContainer: documentRef.getElementById('playedCardsContainer'),
    turnIndicator: documentRef.getElementById('turnIndicator'),
    timerBar: documentRef.getElementById('timerBar'),
    btnPlaySelected: documentRef.getElementById('btnPlaySelected'),
    btnPass: documentRef.getElementById('btnPass'),
    btnContinueGame: documentRef.getElementById('btnContinueGame'),
    myHandArea: documentRef.getElementById('myHandArea'),
    opponentsArea: documentRef.getElementById('opponentsArea'),
    tableArea: documentRef.getElementById('tableArea'),
    winnerMessage: documentRef.getElementById('winnerMessage'),
    btnCopyCode: documentRef.getElementById('btnCopyCode')
  };
}
