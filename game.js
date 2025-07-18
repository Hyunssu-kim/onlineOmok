// 미리 등록된 사용자 목록
const REGISTERED_USERS = [
    'admin', 'player1', 'player2', 'player3', 'player4', 'player5', '사라','현수', '현호', '완재',
    'user1', 'user2', 'user3', 'user4', 'test1', 'test2', 'guest1', 'guest2'
];

// 게임 상태 관리
class OmokGame {
    constructor() {
        this.boardSize = 15;
        this.board = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(0));
        this.currentUserId = null;
        this.currentPlayer = 1; // 1: 흑돌, 2: 백돌
        this.gameState = 'waiting'; // waiting, playing
        this.gameRef = null;
        this.queueRef = null;
        this.gameData = null;
        this.myPosition = null; // 'black', 'white', 'spectator'
        this.isMyTurn = false;
        this.turnTimer = null;
        this.timeLeft = 15;
        this.isHandlingEnd = false;
        this.gameStateTimer = null; // 게임 상태 감시 타이머
        this.lastGameUpdate = Date.now();
        this.gameInactivityThreshold = 30000; // 30초 비활성 임계값
        
        this.initializeElements();
        this.attachEventListeners();
        this.createBoard();
    }

    initializeElements() {
        // DOM 요소들 참조
        this.loginScreen = document.getElementById('loginScreen');
        this.gameScreen = document.getElementById('gameScreen');
        this.userIdInput = document.getElementById('userIdInput');
        this.loginError = document.getElementById('loginError');
        this.currentUserId = document.getElementById('currentUserId');
        this.blackPlayerName = document.getElementById('blackPlayerName');
        this.whitePlayerName = document.getElementById('whitePlayerName');
        this.currentTurn = document.getElementById('currentTurn');
        this.gameState = document.getElementById('gameState');
        this.gameBoard = document.getElementById('gameBoard');
        this.queueList = document.getElementById('queueList');
        this.spectatorList = document.getElementById('spectatorList');
        this.rankingList = document.getElementById('rankingList');
        this.gameResultModal = document.getElementById('gameResultModal');
        this.gameResultTitle = document.getElementById('gameResultTitle');
        this.gameResultMessage = document.getElementById('gameResultMessage');
        this.timerElement = document.getElementById('timer');

        // 채팅 관련 요소
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendChatBtn = document.getElementById('sendChatBtn');

        // 강제 재시작 버튼
        this.forceRestartBtn = document.getElementById('forceRestartBtn');
    }

    attachEventListeners() {
        // 로그인 버튼
        document.getElementById('loginBtn').addEventListener('click', () => this.login());
        
        // 엔터키로 로그인
        this.userIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.login();
            }
        });

        // 로그아웃 버튼
        document.getElementById('logoutBtn').addEventListener('click', () => window.logout());

        // 게임 결과 모달
        document.getElementById('continueBtn').addEventListener('click', () => this.continueGame());

        // 채팅 전송 버튼
        this.sendChatBtn.addEventListener('click', () => this.sendChatMessage());

        // 채팅 입력 엔터키
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        // 강제 재시작 버튼
        this.forceRestartBtn.addEventListener('click', () => this.forceRestartGame());

        // 사이드 패널 탭
        document.querySelectorAll('.tab-link').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                
                // 탭 활성화
                document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // 컨텐츠 활성화
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(`tab-${tabName}`).classList.add('active');
            });
        });

        // 페이지 종료 시 정리
        window.addEventListener('beforeunload', (event) => {
            this.cleanup();
        });

        // 로그아웃 함수 추가
        window.logout = async () => {
            if (this.currentUserId) {
                try {
                    // 동기적으로 제거
                    await window.dbRemove(window.dbRef(window.database, `onlineUsers/${this.currentUserId}`));
                    await window.dbRemove(window.dbRef(window.database, `gameQueue/${this.currentUserId}`));
                    console.log('로그아웃 처리 완료:', this.currentUserId);
                } catch (error) {
                    console.error('로그아웃 처리 실패:', error);
                }
            }
            // 짧은 지연 후 새로고침 (Firebase 처리 시간 확보)
            setTimeout(() => {
                location.reload();
            }, 100);
        };
    }

    createBoard() {
        this.gameBoard.innerHTML = '';
        
        // CSS Grid 방식으로 완전히 재작성
        for (let row = 0; row < this.boardSize; row++) {
            for (let col = 0; col < this.boardSize; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                // Grid 위치 설정 (CSS Grid 자동 배치)
                cell.style.gridColumn = col + 1;
                cell.style.gridRow = row + 1;
                
                cell.addEventListener('click', () => this.handleCellClick(row, col));
                
                this.gameBoard.appendChild(cell);
            }
        }
    }

    async login() {
        const userId = this.userIdInput.value.trim();
        
        if (!userId) {
            this.showLoginError('ID를 입력해주세요.');
            return;
        }

        if (!REGISTERED_USERS.includes(userId)) {
            this.showLoginError('등록되지 않은 사용자입니다.');
            return;
        }

        try {
            this.currentUserId = userId;
            console.log('로그인 시도:', userId);
            
            // Firebase 연결 상태 확인
            if (!window.database) {
                throw new Error('Firebase 데이터베이스 연결 실패');
            }
            
            // 온라인 사용자 등록 (기존 데이터 덮어쓰기)
            const onlineUserRef = window.dbRef(window.database, `onlineUsers/${userId}`);
            const queueUserRef = window.dbRef(window.database, `gameQueue/${userId}`);
            
            await window.dbSet(onlineUserRef, {
                userId: userId,
                loginTime: Date.now(),
                status: 'online'
            });

            // 연결이 끊어지면 자동으로 온라인 사용자에서 제거
            await window.dbOnDisconnect(onlineUserRef).remove();
            await window.dbOnDisconnect(queueUserRef).remove();
            
            this.hideLoginError();
            
            // 게임 화면으로 전환
            this.showGameScreen();
            
            // Firebase 설정 및 게임 참가
            await this.joinGameSystem();
            
        } catch (error) {
            console.error('로그인 실패 상세:', error);
            this.currentUserId = null;
            
            // 구체적인 에러 메시지 제공
            let errorMessage = '로그인에 실패했습니다.';
            if (error.message.includes('Firebase')) {
                errorMessage = 'Firebase 연결에 실패했습니다. 잠시 후 다시 시도해주세요.';
            } else if (error.message.includes('network')) {
                errorMessage = '네트워크 연결을 확인해주세요.';
            } else if (error.message.includes('permission')) {
                errorMessage = '접근 권한이 없습니다. 관리자에게 문의하세요.';
            }
            
            this.showLoginError(errorMessage);
        }
    }

    showLoginError(message) {
        this.loginError.textContent = message;
        this.loginError.style.display = 'block';
    }

    hideLoginError() {
        this.loginError.style.display = 'none';
    }

    showGameScreen() {
        this.loginScreen.style.display = 'none';
        this.gameScreen.style.display = 'block';
        document.getElementById('currentUserId').textContent = this.currentUserId;
    }

    showLoginScreen() {
        this.loginScreen.style.display = 'block';
        this.gameScreen.style.display = 'none';
        this.userIdInput.value = '';
        this.hideLoginError();
    }

    async joinGameSystem() {
        // 게임 시스템 참조 설정
        this.gameRef = window.dbRef(window.database, 'currentGame');
        this.queueRef = window.dbRef(window.database, 'gameQueue');
        this.statsRef = window.dbRef(window.database, 'userStats');
        this.chatRef = window.dbRef(window.database, 'chats');
        
        // 게임 상태 감시
        window.dbOnValue(this.gameRef, (snapshot) => {
            const gameData = snapshot.val();
            this.updateGameState(gameData);
        });

        // 대기열 감시
        window.dbOnValue(this.queueRef, (snapshot) => {
            const queueData = snapshot.val();
            this.updateQueue(queueData);
        });

        // 랭킹 감시
        window.dbOnValue(this.statsRef, (snapshot) => {
            const statsData = snapshot.val();
            this.updateRanking(statsData);
        });

        // 채팅 감시
        window.dbOnValue(this.chatRef, (snapshot) => {
            const chatData = snapshot.val();
            this.updateChat(chatData);
        });

        // 랭킹 로드
        this.loadRankings();

        // 대기열에 추가
        await this.addToQueue();
        
        // 게임 시작 가능한지 확인
        setTimeout(() => {
            this.startNewGameIfReady();
        }, 1000);
    }

    async addToQueue(timestamp = Date.now()) {
        const queueRef = window.dbRef(window.database, `gameQueue/${this.currentUserId}`);
        await window.dbSet(queueRef, {
            userId: this.currentUserId,
            joinedAt: timestamp,
            status: 'waiting'
        });
    }

    async removeFromQueue() {
        const queueRef = window.dbRef(window.database, `gameQueue/${this.currentUserId}`);
        await window.dbRemove(queueRef);
    }

    updateGameState(gameData) {
        if (this.isHandlingEnd) return;

        this.gameData = gameData;
        this.lastGameUpdate = Date.now(); // 게임 업데이트 시간 기록

        if (!gameData) {
            this.gameState.textContent = '게임 대기중';
            this.forceRestartBtn.style.display = 'none';
            this.stopGameStateMonitoring();
            this.startNewGameIfReady();
            return;
        }

        // 게임 종료 처리
        if (gameData.state === 'finished' && !this.isHandlingEnd) {
            this.isHandlingEnd = true; // 중복 실행 방지
            this.handleGameEnd(gameData);
            return;
        }

        // 상대방이 나간 경우 처리
        if (gameData.state === 'playing' && (!gameData.blackPlayer || !gameData.whitePlayer)) {
            this.handleOpponentLeft();
            return;
        }

        // 현재 사용자의 위치 확인
        if (gameData.blackPlayer === this.currentUserId) {
            this.myPosition = 'black';
        } else if (gameData.whitePlayer === this.currentUserId) {
            this.myPosition = 'white';
        } else {
            this.myPosition = 'spectator';
        }

        // 게임 정보 업데이트 (턴 정보를 먼저 업데이트)
        this.updateTurnInfo(gameData);
        this.updateGameDisplay(gameData);
        this.updateBoard(gameData.board);
        
        // 게임 진행 중일 때 강제 재시작 버튼 표시 및 상태 감시 시작 (admin만)
        if (gameData.state === 'playing' && this.currentUserId === 'admin') {
            this.forceRestartBtn.style.display = 'inline-block';
            this.startGameStateMonitoring();
        } else {
            this.forceRestartBtn.style.display = 'none';
            if (gameData.state === 'playing') {
                this.startGameStateMonitoring();
            } else {
                this.stopGameStateMonitoring();
            }
        }
    }

    updateGameDisplay(gameData) {
        this.blackPlayerName.textContent = gameData.blackPlayer || '대기중';
        this.whitePlayerName.textContent = gameData.whitePlayer || '대기중';
        
        if (gameData.state === 'playing') {
            this.gameState.textContent = '게임 진행중';

            // 타이머는 내 차례일 때만 시작
            if (this.isMyTurn) {
                this.startTimer();
            } else {
                this.stopTimer();
            }
        } else if (gameData.state === 'finished') {
            this.gameState.textContent = '게임 종료';
            this.stopTimer();
        } else {
            this.gameState.textContent = '게임 대기중';
            this.stopTimer();
        }
    }

    updateTurnInfo(gameData) {
        if (gameData.state !== 'playing') {
            this.currentTurn.textContent = '게임 대기중';
            this.isMyTurn = false;
            this.stopTimer();
            return;
        }

        if (gameData.currentPlayer === 1) {
            this.currentTurn.textContent = '흑돌 차례';
            this.isMyTurn = (this.myPosition === 'black');
        } else {
            this.currentTurn.textContent = '백돌 차례';
            this.isMyTurn = (this.myPosition === 'white');
        }

        // 타이머는 updateGameDisplay에서 처리하므로 여기서는 제거
    }

    startTimer() {
        this.stopTimer(); // 기존 타이머 정리
        this.timeLeft = 15;
        this.updateTimerDisplay();

        this.turnTimer = setInterval(() => {
            this.timeLeft--;
            this.updateTimerDisplay();

            if (this.timeLeft <= 0) {
                this.handleTimeOut();
            }
        }, 1000);
    }

    stopTimer() {
        if (this.turnTimer) {
            clearInterval(this.turnTimer);
            this.turnTimer = null;
        }
        this.timerElement.textContent = '-';
        this.timerElement.style.color = '#666';
        this.timerElement.style.fontWeight = 'normal';
    }

    updateTimerDisplay() {
        this.timerElement.textContent = `${this.timeLeft}초`;
        
        // 5초 이하일 때 경고 색상
        if (this.timeLeft <= 5) {
            this.timerElement.style.color = '#d32f2f';
            this.timerElement.style.fontWeight = 'bold';
        } else {
            this.timerElement.style.color = '#333';
            this.timerElement.style.fontWeight = 'normal';
        }
    }

    async handleTimeOut() {
        console.log('타이머 시간 초과 발생!');
        this.stopTimer();

        if (!this.gameData || this.gameData.state !== 'playing') {
            console.log('게임이 진행 중이 아님, 시간 초과 처리 취소');
            return;
        }

        // 시간 초과 시 현재 턴의 플레이어가 패배
        const currentPlayerName = this.gameData.currentPlayer === 1 ? this.gameData.blackPlayer : this.gameData.whitePlayer;
        const winnerColor = this.gameData.currentPlayer === 1 ? 'white' : 'black';
        const winnerName = this.gameData.currentPlayer === 1 ? this.gameData.whitePlayer : this.gameData.blackPlayer;

        console.log(`시간 초과: ${currentPlayerName} 패배, ${winnerName} 승리`);

        const gameUpdate = {
            ...this.gameData,
            winner: winnerColor,
            state: 'finished',
            endReason: 'timeout',
            endTime: Date.now(),
            timeoutPlayer: currentPlayerName
        };

        await window.dbSet(this.gameRef, gameUpdate);

        // 시스템 메시지 전송
        try {
            const chatData = {
                user: 'system',
                message: `${currentPlayerName}님이 시간 초과로 패배했습니다.`,
                timestamp: Date.now(),
                type: 'system'
            };
            await window.dbPush(this.chatRef, chatData);
        } catch (error) {
            console.error('시간 초과 메시지 전송 실패:', error);
        }
    }

    async startNewGameIfReady() {
        try {
            console.log('게임 시작 확인 중...');
            
            // 현재 게임이 있는지 확인
            const currentGameSnapshot = await new Promise((resolve) => {
                window.dbOnValue(this.gameRef, resolve, { onlyOnce: true });
            });

            // 이미 게임이 진행 중이면 새 게임을 시작하지 않음
            if (currentGameSnapshot.exists()) {
                console.log('이미 게임이 진행 중입니다.');
                return;
            }

            // 대기열에서 처음 두 명을 가져와서 게임 시작
            const queueSnapshot = await new Promise((resolve) => {
                window.dbOnValue(this.queueRef, resolve, { onlyOnce: true });
            });

            if (!queueSnapshot.exists()) {
                console.log('대기열이 비어있습니다.');
                return;
            }

            const queueData = queueSnapshot.val();
            console.log('대기열 데이터:', queueData);
            
            const waitingPlayers = Object.entries(queueData)
                .map(([userId, data]) => ({ userId, ...data }))
                .filter(player => player.status === 'waiting')
                .sort((a, b) => a.joinedAt - b.joinedAt);

            console.log('대기 중인 플레이어:', waitingPlayers);

            if (waitingPlayers.length >= 2) {
                const blackPlayer = waitingPlayers[0];
                const whitePlayer = waitingPlayers[1];

                console.log('게임 시작:', blackPlayer.userId, 'vs', whitePlayer.userId);

                // 새 게임 생성 - 빈 보드에서 시작
                const initialBoard = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(0));
                
                const newGameData = {
                    blackPlayer: blackPlayer.userId,
                    whitePlayer: whitePlayer.userId,
                    currentPlayer: 1, // 흑돌부터 시작
                    board: initialBoard,
                    state: 'playing',
                    startTime: Date.now(),
                    winner: null,
                    moves: []
                };

                await window.dbSet(this.gameRef, newGameData);

                // 플레이어들을 대기열에서 제거
                await window.dbRemove(window.dbRef(window.database, `gameQueue/${blackPlayer.userId}`));
                await window.dbRemove(window.dbRef(window.database, `gameQueue/${whitePlayer.userId}`));
                
                console.log('게임이 성공적으로 시작되었습니다.');
            } else {
                console.log(`대기 중인 플레이어가 부족합니다: ${waitingPlayers.length}명`);
            }
        } catch (error) {
            console.error('새 게임 시작 실패:', error);
        }
    }

    updateQueue(queueData) {
        this.queueList.innerHTML = '';
        
        if (!queueData) {
            this.queueList.innerHTML = '<div class="queue-item">대기 중인 플레이어가 없습니다.</div>';
            return;
        }

        const waitingPlayers = Object.entries(queueData)
            .map(([userId, data]) => ({ userId, ...data }))
            .filter(player => player.status === 'waiting')
            .sort((a, b) => a.joinedAt - b.joinedAt);

        if (waitingPlayers.length === 0) {
            this.queueList.innerHTML = '<div class="queue-item">대기 중인 플레이어가 없습니다.</div>';
            return;
        }

        waitingPlayers.forEach((player, index) => {
            const queueItem = document.createElement('div');
            queueItem.className = `queue-item ${player.userId === this.currentUserId ? 'current-user' : ''}`;
            
            queueItem.innerHTML = `
                <span>${player.userId}</span>
                <span class="position">${index + 1}번째</span>
            `;
            
            this.queueList.appendChild(queueItem);
        });

        // 관전자 업데이트
        this.updateSpectators();
    }

    updateSpectators() {
        this.spectatorList.innerHTML = '';
        
        if (this.myPosition === 'spectator') {
            const spectatorItem = document.createElement('div');
            spectatorItem.className = 'spectator-item';
            spectatorItem.textContent = this.currentUserId + ' (관전중)';
            this.spectatorList.appendChild(spectatorItem);
        }
    }

    updateBoard(boardData) {
        if (!boardData) return;
        
        // 보드 데이터 크기 확인 및 조정
        if (Array.isArray(boardData) && boardData.length !== this.boardSize) {
            // 크기가 다르면 새로운 15x15 보드로 초기화
            this.board = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(0));
        } else {
            this.board = boardData;
        }
        
        const cells = this.gameBoard.querySelectorAll('.cell');
        
        cells.forEach((cell, index) => {
            const row = Math.floor(index / this.boardSize);
            const col = index % this.boardSize;
            
            // 범위 체크
            if (row >= this.boardSize || col >= this.boardSize) return;
            
            const cellValue = this.board[row] && this.board[row][col] ? this.board[row][col] : 0;
            
            // 기존 돌 제거
            const existingStone = cell.querySelector('.stone');
            if (existingStone) {
                existingStone.remove();
            }
            cell.classList.remove('stone', 'forbidden');
            
            if (cellValue !== 0) {
                const stone = document.createElement('div');
                stone.className = `stone ${cellValue === 1 ? 'black' : 'white'}`;
                cell.appendChild(stone);
                cell.classList.add('stone');
            } else if (this.gameData && this.gameData.state === 'playing' && 
                      this.gameData.currentPlayer === 1 && this.myPosition === 'black') {
                // 흑돌 차례이고 내가 흑돌일 때 금수 자리 표시
                if (this.isForbiddenMove(this.board, row, col, 1)) {
                    cell.classList.add('forbidden');
                }
            }
        });
    }

    async handleCellClick(row, col) {
        if (!this.gameData || this.gameData.state !== 'playing' || !this.isMyTurn || this.board[row][col] !== 0) {
            return;
        }

        if (this.gameData.currentPlayer === 1 && this.isForbiddenMove(this.board, row, col, 1)) {
            console.log('렌주룰 위반 감지:', { 
                row, 
                col, 
                currentPlayer: this.gameData.currentPlayer,
                board: this.board
            });
            alert('금수 자리입니다! 다른 곳에 두세요. (3-3, 4-4, 장연 금지)');
            return;
        }

        this.stopTimer();

        const newBoard = this.board.map(r => [...r]);
        newBoard[row][col] = this.gameData.currentPlayer;

        const winner = this.checkWinner(newBoard, row, col);
        
        if (winner) {
            // 승리 확정 시 즉시 게임 종료
            const gameUpdate = {
                ...this.gameData,
                board: newBoard,
                currentPlayer: this.gameData.currentPlayer,
                winner: winner,
                state: 'finished',
                endReason: 'victory',
                endTime: Date.now(),
                moves: [...(this.gameData.moves || []), {
                    player: this.gameData.currentPlayer,
                    row: row,
                    col: col,
                    timestamp: Date.now()
                }]
            };
            
            await window.dbSet(this.gameRef, gameUpdate);
            console.log('게임 종료 - 승리:', winner);
        } else {
            // 게임 계속
            const gameUpdate = {
                ...this.gameData,
                board: newBoard,
                currentPlayer: this.gameData.currentPlayer === 1 ? 2 : 1,
                winner: null,
                state: 'playing',
                moves: [...(this.gameData.moves || []), {
                    player: this.gameData.currentPlayer,
                    row: row,
                    col: col,
                    timestamp: Date.now()
                }]
            };

            await window.dbSet(this.gameRef, gameUpdate);
        }
    }

    checkWinner(board, row, col) {
        const directions = [
            [0, 1],   // 가로
            [1, 0],   // 세로
            [1, 1],   // 대각선 \
            [1, -1]   // 대각선 /
        ];
        
        const currentStone = board[row][col];
        
        for (const [dx, dy] of directions) {
            let count = 1; // 현재 돌 포함
            
            // 한 방향으로 확인
            for (let i = 1; i < 5; i++) {
                const newRow = row + dx * i;
                const newCol = col + dy * i;
                
                if (newRow >= 0 && newRow < this.boardSize && 
                    newCol >= 0 && newCol < this.boardSize &&
                    board[newRow][newCol] === currentStone) {
                    count++;
                } else {
                    break;
                }
            }
            
            // 반대 방향으로 확인
            for (let i = 1; i < 5; i++) {
                const newRow = row - dx * i;
                const newCol = col - dy * i;
                
                if (newRow >= 0 && newRow < this.boardSize && 
                    newCol >= 0 && newCol < this.boardSize &&
                    board[newRow][newCol] === currentStone) {
                    count++;
                } else {
                    break;
                }
            }
            
            if (count >= 5) {
                return currentStone === 1 ? 'black' : 'white';
            }
        }
        
        return null;
    }

    // 렌즈룰 (흑돌 금수) 체크 함수
    isForbiddenMove(board, row, col, player) {
        // 흑돌이 아니면 금수 없음
        if (player !== 1) return false;

        // 임시로 돌을 놓고 체크
        const tempBoard = board.map(row => [...row]);
        tempBoard[row][col] = player;

        // 5목이 완성되면 금수가 아님 (승리)
        if (this.checkWinner(tempBoard, row, col)) {
            return false;
        }

        // 장연(6목 이상) 체크
        if (this.countInDirection(tempBoard, row, col, player) >= 6) {
            console.log('장연 금수:', row, col);
            return true;
        }

        // 3-3 체크
        if (this.checkDoubleThree(tempBoard, row, col, player)) {
            console.log('3-3 금수:', row, col);
            return true;
        }

        // 4-4 체크
        if (this.checkDoubleFour(tempBoard, row, col, player)) {
            console.log('4-4 금수:', row, col);
            return true;
        }

        return false;
    }

    // 장연(6목 이상) 체크
    isLongConnection(board, row, col, player) {
        const directions = [
            [0, 1],   // 가로
            [1, 0],   // 세로
            [1, 1],   // 대각선 \
            [1, -1]   // 대각선 /
        ];

        for (const [dx, dy] of directions) {
            let count = 1; // 현재 돌 포함

            // 한 방향으로 확인
            for (let i = 1; i < 6; i++) {
                const newRow = row + dx * i;
                const newCol = col + dy * i;

                if (newRow >= 0 && newRow < this.boardSize && 
                    newCol >= 0 && newCol < this.boardSize &&
                    board[newRow][newCol] === player) {
                    count++;
                } else {
                    break;
                }
            }

            // 반대 방향으로 확인
            for (let i = 1; i < 6; i++) {
                const newRow = row - dx * i;
                const newCol = col - dy * i;

                if (newRow >= 0 && newRow < this.boardSize && 
                    newCol >= 0 && newCol < this.boardSize &&
                    board[newRow][newCol] === player) {
                    count++;
                } else {
                    break;
                }
            }

            if (count >= 6) {
                return true;
            }
        }

        return false;
    }

    // 3-3 체크 (동시에 두 개의 3을 만드는지)
    isDoubleThree(board, row, col, player) {
        const directions = [
            [0, 1],   // 가로
            [1, 0],   // 세로
            [1, 1],   // 대각선 \
            [1, -1]   // 대각선 /
        ];

        let threeCount = 0;

        for (const [dx, dy] of directions) {
            if (this.isOpenThree(board, row, col, dx, dy, player)) {
                threeCount++;
            }
        }

        return threeCount >= 2;
    }

    // 4-4 체크 (동시에 두 개의 4를 만드는지)
    isDoubleFour(board, row, col, player) {
        const directions = [
            [0, 1],   // 가로
            [1, 0],   // 세로
            [1, 1],   // 대각선 \
            [1, -1]   // 대각선 /
        ];

        let fourCount = 0;

        for (const [dx, dy] of directions) {
            if (this.isOpenFour(board, row, col, dx, dy, player)) {
                fourCount++;
            }
        }

        return fourCount >= 2;
    }

    // 열린 3인지 체크
    isOpenThree(board, row, col, dx, dy, player) {
        let count = 1; // 현재 돌 포함
        let leftEmpty = false, rightEmpty = false;

        // 한 방향으로 확인
        let i = 1;
        while (i <= 4) {
            const newRow = row + dx * i;
            const newCol = col + dy * i;

            if (newRow >= 0 && newRow < this.boardSize && 
                newCol >= 0 && newCol < this.boardSize) {
                if (board[newRow][newCol] === player) {
                    count++;
                } else if (board[newRow][newCol] === 0 && i === count) {
                    rightEmpty = true;
                    break;
                } else {
                    break;
                }
            }
            i++;
        }

        // 반대 방향으로 확인
        i = 1;
        while (i <= 4) {
            const newRow = row - dx * i;
            const newCol = col - dy * i;

            if (newRow >= 0 && newRow < this.boardSize && 
                newCol >= 0 && newCol < this.boardSize) {
                if (board[newRow][newCol] === player) {
                    count++;
                } else if (board[newRow][newCol] === 0 && i === count - 1) {
                    leftEmpty = true;
                    break;
                } else {
                    break;
                }
            }
            i++;
        }

        return count === 3 && leftEmpty && rightEmpty;
    }

    // 열린 4인지 체크
    isOpenFour(board, row, col, dx, dy, player) {
        let count = 1; // 현재 돌 포함
        let leftEmpty = false, rightEmpty = false;

        // 한 방향으로 확인
        let i = 1;
        while (i <= 4) {
            const newRow = row + dx * i;
            const newCol = col + dy * i;

            if (newRow >= 0 && newRow < this.boardSize && 
                newCol >= 0 && newCol < this.boardSize) {
                if (board[newRow][newCol] === player) {
                    count++;
                } else if (board[newRow][newCol] === 0 && i === count) {
                    rightEmpty = true;
                    break;
                } else {
                    break;
                }
            }
            i++;
        }

        // 반대 방향으로 확인
        i = 1;
        while (i <= 4) {
            const newRow = row - dx * i;
            const newCol = col - dy * i;

            if (newRow >= 0 && newRow < this.boardSize && 
                newCol >= 0 && newCol < this.boardSize) {
                if (board[newRow][newCol] === player) {
                    count++;
                } else if (board[newRow][newCol] === 0 && i === count - 1) {
                    leftEmpty = true;
                    break;
                } else {
                    break;
                }
            }
            i++;
        }

        return count === 4 && leftEmpty && rightEmpty;
    }

    // 방향별 연속 돌 개수 세기 (최대값 반환)
    countInDirection(board, row, col, player) {
        const directions = [[0,1], [1,0], [1,1], [1,-1]];
        let maxCount = 1;

        for (const [dx, dy] of directions) {
            let count = 1;
            
            // 양방향으로 세기
            for (let i = 1; i < 15; i++) {
                const r = row + dx * i;
                const c = col + dy * i;
                if (r >= 0 && r < 15 && c >= 0 && c < 15 && board[r][c] === player) {
                    count++;
                } else break;
            }
            
            for (let i = 1; i < 15; i++) {
                const r = row - dx * i;
                const c = col - dy * i;
                if (r >= 0 && r < 15 && c >= 0 && c < 15 && board[r][c] === player) {
                    count++;
                } else break;
            }
            
            maxCount = Math.max(maxCount, count);
        }
        
        return maxCount;
    }

    // 3-3 금수 체크
    checkDoubleThree(board, row, col, player) {
        const directions = [[0,1], [1,0], [1,1], [1,-1]];
        const directionNames = ['가로', '세로', '대각선\\', '대각선/'];
        let threeCount = 0;
        let foundDirections = [];

        for (let i = 0; i < directions.length; i++) {
            const [dx, dy] = directions[i];
            if (this.isThree(board, row, col, dx, dy, player)) {
                threeCount++;
                foundDirections.push(directionNames[i]);
            }
        }

        if (threeCount >= 2) {
            console.log(`3-3 금수 발견 (${row}, ${col}):`, foundDirections.join(', '));
        }

        return threeCount >= 2;
    }

    // 4-4 금수 체크
    checkDoubleFour(board, row, col, player) {
        const directions = [[0,1], [1,0], [1,1], [1,-1]];
        let fourCount = 0;

        for (const [dx, dy] of directions) {
            if (this.isFour(board, row, col, dx, dy, player)) {
                fourCount++;
            }
        }

        return fourCount >= 2;
    }

    // 한 방향에서 열린 3인지 확인 (정확한 렌주룰)
    isThree(board, row, col, dx, dy, player) {
        // 임시로 돌을 놓고 체크
        const tempBoard = board.map(row => [...row]);
        tempBoard[row][col] = player;
        
        // 이 방향으로 연속된 돌의 개수와 패턴 확인
        let leftCount = 0;
        let rightCount = 0;
        
        // 왼쪽 방향으로 연속된 돌 세기
        for (let i = 1; i < 5; i++) {
            const r = row - dx * i;
            const c = col - dy * i;
            if (r >= 0 && r < 15 && c >= 0 && c < 15 && tempBoard[r][c] === player) {
                leftCount++;
            } else {
                break;
            }
        }
        
        // 오른쪽 방향으로 연속된 돌 세기
        for (let i = 1; i < 5; i++) {
            const r = row + dx * i;
            const c = col + dy * i;
            if (r >= 0 && r < 15 && c >= 0 && c < 15 && tempBoard[r][c] === player) {
                rightCount++;
            } else {
                break;
            }
        }
        
        const totalCount = leftCount + rightCount + 1; // 현재 돌 포함
        
        // 정확히 3개이고, 양쪽이 모두 비어있어야 열린 3
        if (totalCount === 3) {
            const leftR = row - dx * (leftCount + 1);
            const leftC = col - dy * (leftCount + 1);
            const rightR = row + dx * (rightCount + 1);
            const rightC = col + dy * (rightCount + 1);
            
            const leftEmpty = (leftR >= 0 && leftR < 15 && leftC >= 0 && leftC < 15 && tempBoard[leftR][leftC] === 0);
            const rightEmpty = (rightR >= 0 && rightR < 15 && rightC >= 0 && rightC < 15 && tempBoard[rightR][rightC] === 0);
            
            return leftEmpty && rightEmpty;
        }
        
        return false;
    }

    // 한 방향에서 열린 4인지 확인 (정확한 렌주룰)
    isFour(board, row, col, dx, dy, player) {
        // 임시로 돌을 놓고 체크
        const tempBoard = board.map(row => [...row]);
        tempBoard[row][col] = player;
        
        // 이 방향으로 연속된 돌의 개수와 패턴 확인
        let leftCount = 0;
        let rightCount = 0;
        
        // 왼쪽 방향으로 연속된 돌 세기
        for (let i = 1; i < 5; i++) {
            const r = row - dx * i;
            const c = col - dy * i;
            if (r >= 0 && r < 15 && c >= 0 && c < 15 && tempBoard[r][c] === player) {
                leftCount++;
            } else {
                break;
            }
        }
        
        // 오른쪽 방향으로 연속된 돌 세기
        for (let i = 1; i < 5; i++) {
            const r = row + dx * i;
            const c = col + dy * i;
            if (r >= 0 && r < 15 && c >= 0 && c < 15 && tempBoard[r][c] === player) {
                rightCount++;
            } else {
                break;
            }
        }
        
        const totalCount = leftCount + rightCount + 1; // 현재 돌 포함
        
        // 정확히 4개이고, 한쪽이라도 비어있어야 열린 4 (승리 위협)
        if (totalCount === 4) {
            const leftR = row - dx * (leftCount + 1);
            const leftC = col - dy * (leftCount + 1);
            const rightR = row + dx * (rightCount + 1);
            const rightC = col + dy * (rightCount + 1);
            
            const leftEmpty = (leftR >= 0 && leftR < 15 && leftC >= 0 && leftC < 15 && tempBoard[leftR][leftC] === 0);
            const rightEmpty = (rightR >= 0 && rightR < 15 && rightC >= 0 && rightC < 15 && tempBoard[rightR][rightC] === 0);
            
            return leftEmpty || rightEmpty; // 한쪽만 비어있어도 열린 4
        }
        
        return false;
    }

    // 채팅 메시지 전송
    async sendChatMessage() {
        const message = this.chatInput.value.trim();
        if (!message || !this.currentUserId) return;

        const chatData = {
            user: this.currentUserId,
            message: message,
            timestamp: Date.now(),
            type: 'message'
        };

        try {
            await window.dbPush(this.chatRef, chatData);
            this.chatInput.value = '';
        } catch (error) {
            console.error('채팅 전송 실패:', error);
        }
    }

    // 채팅 업데이트
    updateChat(chatData) {
        if (!chatData) {
            this.chatMessages.innerHTML = '<div class="chat-message system-message">채팅을 시작하세요!</div>';
            return;
        }

        const messages = Object.values(chatData).sort((a, b) => a.timestamp - b.timestamp);
        this.chatMessages.innerHTML = '';

        // 최근 50개 메시지만 표시
        const recentMessages = messages.slice(-50);

        recentMessages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${msg.user === this.currentUserId ? 'my-message' : ''}`;
            
            const time = new Date(msg.timestamp).toLocaleTimeString('ko-KR', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });

            if (msg.type === 'system') {
                messageDiv.className += ' system-message';
                messageDiv.innerHTML = `${msg.message} <span class="timestamp">${time}</span>`;
            } else {
                messageDiv.innerHTML = `
                    <span class="username">${msg.user}:</span>
                    ${msg.message}
                    <span class="timestamp">${time}</span>
                `;
            }

            this.chatMessages.appendChild(messageDiv);
        });

        // 스크롤을 맨 아래로
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }


    async handleGameEnd(gameData) {
        this.stopTimer();

        const { winner, blackPlayer, whitePlayer } = gameData;
        const winnerPlayer = winner === 'black' ? blackPlayer : whitePlayer;
        const loserPlayer = winner === 'black' ? whitePlayer : blackPlayer;

        this.showGameResult(winner, winnerPlayer);

        if (this.myPosition === 'black' || this.myPosition === 'white') {
            await this.updatePlayerStats(winnerPlayer, loserPlayer);

            setTimeout(async () => {
                this.gameResultModal.style.display = 'none';
                await this.cleanupGame();

                // 승자는 우선권으로 앞쪽에, 패자는 뒤쪽에 배치
                if (this.currentUserId === winnerPlayer) {
                    await this.addToQueue(Date.now() - 1000); // 승자 우선권
                } else {
                    await this.addToQueue(Date.now()); // 패자는 일반 순서
                }

                this.isHandlingEnd = false;
                this.startNewGameIfReady();
            }, 3000);
        } else {
            setTimeout(async () => {
                await this.cleanupGame();
                this.isHandlingEnd = false;
                this.startNewGameIfReady();
            }, 3000);
        }
    }

    showGameResult(winner, winnerPlayer) {
        const isWinner = winnerPlayer === this.currentUserId;
        
        this.gameResultTitle.textContent = isWinner ? '승리!' : '패배';
        this.gameResultMessage.textContent = `${winnerPlayer}님이 승리했습니다!`;
        
        this.gameResultModal.style.display = 'block';
    }

    async updatePlayerStats(winner, loser) {
        // 승자 전적 업데이트
        const winnerStatsRef = window.dbRef(window.database, `userStats/${winner}`);
        const winnerSnapshot = await new Promise((resolve) => {
            window.dbOnValue(winnerStatsRef, resolve, { onlyOnce: true });
        });

        const winnerStats = winnerSnapshot.exists() ? winnerSnapshot.val() : { wins: 0, losses: 0, games: 0 };
        winnerStats.wins++;
        winnerStats.games++;
        winnerStats.name = winner;
        await window.dbSet(winnerStatsRef, winnerStats);

        // 패자 전적 업데이트
        const loserStatsRef = window.dbRef(window.database, `userStats/${loser}`);
        const loserSnapshot = await new Promise((resolve) => {
            window.dbOnValue(loserStatsRef, resolve, { onlyOnce: true });
        });

        const loserStats = loserSnapshot.exists() ? loserSnapshot.val() : { wins: 0, losses: 0, games: 0 };
        loserStats.losses++;
        loserStats.games++;
        loserStats.name = loser;
        await window.dbSet(loserStatsRef, loserStats);
    }

    async moveLoserToQueueEnd(loser) {
        // 패배자를 대기열에 다시 추가 (맨 뒤로)
        const queueRef = window.dbRef(window.database, `gameQueue/${loser}`);
        await window.dbSet(queueRef, {
            userId: loser,
            joinedAt: Date.now(), // 현재 시간으로 설정하여 맨 뒤로
            status: 'waiting'
        });
    }

    async handleOpponentLeft() {
        // 상대방이 나간 경우 처리
        this.gameState.textContent = '상대방이 나갔습니다';
        this.currentTurn.textContent = '게임 중단됨';
        
        // 승리로 처리 (상대방 기권)
        const isBlackPlayer = this.myPosition === 'black';
        const winnerPlayer = this.currentUserId;
        const loserPlayer = isBlackPlayer ? this.gameData.whitePlayer : this.gameData.blackPlayer;
        
        // 전적 업데이트
        if (loserPlayer) {
            await this.updatePlayerStats(winnerPlayer, loserPlayer);
        }
        
        // 승리 모달 표시
        this.showGameResult(isBlackPlayer ? 'black' : 'white', winnerPlayer);
        
        // 잠시 후 게임 정리하고 다시 시작
        setTimeout(async () => {
            // 게임 결과 모달 닫기
            this.gameResultModal.style.display = 'none';
            
            // 게임 정리
            await this.cleanupGame();
            
            // 남은 플레이어를 다시 대기열에 추가
            await this.addToQueue();
            
            // 새 게임 시작 확인 (약간의 지연 후)
            setTimeout(() => {
                this.startNewGameIfReady();
            }, 500);
        }, 3000);
    }

    async cleanupGame() {
        // 타이머 정지
        this.stopTimer();
        
        // 현재 게임 삭제
        await window.dbRemove(this.gameRef);
        
        // 게임 상태 초기화
        this.gameData = null;
        this.myPosition = null;
        this.isMyTurn = false;
        
        // UI 상태 초기화
        this.gameState.textContent = '게임 대기중';
        this.currentTurn.textContent = '게임 대기중';
        this.blackPlayerName.textContent = '대기중';
        this.whitePlayerName.textContent = '대기중';
        
        // 보드 초기화
        this.board = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(0));
        this.updateBoard(this.board);
    }

    continueGame() {
        this.gameResultModal.style.display = 'none';
        
        // 모달을 닫을 때 게임 시작 확인
        setTimeout(() => {
            this.startNewGameIfReady();
        }, 200);
    }

    async loadRankings() {
        const statsRef = window.dbRef(window.database, 'userStats');
        
        window.dbOnValue(statsRef, (snapshot) => {
            if (snapshot.exists()) {
                const stats = snapshot.val();
                this.updateRankingDisplay(stats);
            }
        });
    }

    updateRankingDisplay(stats) {
        const statsArray = Object.values(stats)
            .filter(stat => stat.games > 0)
            .sort((a, b) => {
                const aWinRate = a.wins / a.games;
                const bWinRate = b.wins / b.games;
                if (aWinRate !== bWinRate) return bWinRate - aWinRate;
                return b.wins - a.wins;
            })
            .slice(0, 10);
        
        this.rankingList.innerHTML = '';
        
        if (statsArray.length === 0) {
            this.rankingList.innerHTML = '<div class="ranking-item">아직 랭킹 정보가 없습니다.</div>';
            return;
        }
        
        statsArray.forEach((stat, index) => {
            const rankItem = document.createElement('div');
            rankItem.className = `ranking-item rank-${index + 1}`;
            
            rankItem.innerHTML = `
                <div class="rank-info">
                    <div class="rank-number">${index + 1}</div>
                    <div class="player-name">${stat.name}</div>
                </div>
                <div class="win-rate">${stat.wins}-${stat.losses}</div>
            `;
            
            this.rankingList.appendChild(rankItem);
        });
    }

    logout() {
        this.cleanup();
        this.showLoginScreen();
        this.currentUserId = null;
    }

    cleanup() {
        // Firebase 리스너 제거
        if (this.gameRef) {
            window.dbOff(this.gameRef);
        }
        if (this.queueRef) {
            window.dbOff(this.queueRef);
        }
        
        // 온라인 사용자 및 대기열에서 제거 (Beacon API 사용)
        if (this.currentUserId) {
            // Beacon API를 사용하여 안정적으로 데이터 전송
            const firebaseApiUrl = `https://my-app-tesths-default-rtdb.firebaseio.com/onlineUsers/${this.currentUserId}.json`;
            const queueApiUrl = `https://my-app-tesths-default-rtdb.firebaseio.com/gameQueue/${this.currentUserId}.json`;
            
            // Beacon으로 삭제 요청 전송 (DELETE 메서드로)
            if (navigator.sendBeacon) {
                try {
                    fetch(firebaseApiUrl, { method: 'DELETE' });
                    fetch(queueApiUrl, { method: 'DELETE' });
                    console.log('Beacon을 통한 cleanup 완료:', this.currentUserId);
                } catch (error) {
                    console.error('Beacon cleanup 실패:', error);
                }
            }
            
            // 일반적인 제거도 시도
            this.removeFromQueue();
        }
    }

    // 게임 상태 감시 시작
    startGameStateMonitoring() {
        this.stopGameStateMonitoring(); // 기존 감시 중지
        
        this.gameStateTimer = setInterval(() => {
            const now = Date.now();
            const timeSinceLastUpdate = now - this.lastGameUpdate;
            
            // 30초 이상 게임 상태가 업데이트되지 않으면 자동 재시작 (admin이 있을 때만)
            if (timeSinceLastUpdate > this.gameInactivityThreshold) {
                console.error('게임이 30초 이상 멈춰있습니다.');
                
                // admin이 접속해 있을 때만 자동 재시작
                if (this.currentUserId === 'admin') {
                    console.log('admin 권한으로 자동 재시작 실행');
                    this.forceRestartGame();
                } else {
                    console.log('admin이 접속하지 않아 자동 재시작을 하지 않습니다.');
                }
            }
        }, 10000); // 10초마다 체크
    }

    // 게임 상태 감시 중지
    stopGameStateMonitoring() {
        if (this.gameStateTimer) {
            clearInterval(this.gameStateTimer);
            this.gameStateTimer = null;
        }
    }

    // 강제 게임 재시작 (admin만 가능)
    async forceRestartGame() {
        console.log('강제 게임 재시작 실행');
        
        // admin 권한 체크
        if (this.currentUserId !== 'admin') {
            alert('관리자만 게임을 강제로 재시작할 수 있습니다.');
            return;
        }
        
        if (confirm('현재 게임을 강제로 종료하고 새 게임을 시작하시겠습니까?')) {
            try {
                // 현재 게임 삭제
                await window.dbRemove(this.gameRef);
                console.log('현재 게임 삭제 완료');
                
                // 게임 상태 초기화
                this.isHandlingEnd = false;
                this.gameData = null;
                this.myPosition = null;
                this.isMyTurn = false;
                
                // 타이머 정지
                this.stopTimer();
                this.stopGameStateMonitoring();
                
                // 강제 재시작 버튼 숨기기
                this.forceRestartBtn.style.display = 'none';
                
                // 시스템 메시지 전송
                const chatData = {
                    user: 'system',
                    message: `${this.currentUserId}님이 게임을 재시작했습니다.`,
                    timestamp: Date.now(),
                    type: 'system'
                };
                await window.dbPush(this.chatRef, chatData);
                
                // 모든 플레이어를 대기열로 복귀
                await this.addToQueue();
                
                // 잠시 후 새 게임 시작 시도
                setTimeout(() => {
                    this.startNewGameIfReady();
                }, 1000);
                
                console.log('강제 게임 재시작 완료');
                
            } catch (error) {
                console.error('강제 게임 재시작 실패:', error);
                alert('게임 재시작에 실패했습니다.');
            }
        }
    }
}

// 게임 초기화
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM 로드 완료, Firebase 초기화 대기 중...');
    
    // Firebase가 로드될 때까지 대기 (타임아웃 추가)
    let checkCount = 0;
    const maxChecks = 100; // 10초 대기 (100ms * 100 = 10초)
    
    const checkFirebase = () => {
        checkCount++;
        
        if (window.database && window.dbRef && window.dbSet) {
            console.log('Firebase 초기화 완료, 게임 시작');
            new OmokGame();
        } else if (checkCount >= maxChecks) {
            console.error('Firebase 초기화 타임아웃');
            // 오류 메시지 표시
            const loginError = document.getElementById('loginError');
            if (loginError) {
                loginError.textContent = 'Firebase 초기화에 실패했습니다. 페이지를 새로고침해주세요.';
                loginError.style.display = 'block';
            }
        } else {
            console.log(`Firebase 초기화 대기 중... (${checkCount}/${maxChecks})`);
            setTimeout(checkFirebase, 100);
        }
    };
    
    checkFirebase();
});