// Firebase 설정 - 보안 강화 버전
// 주의: 클라이언트 측 Firebase API 키는 완전히 숨길 수 없습니다.
// 대신 Firebase Security Rules와 도메인 제한으로 보안을 강화합니다.

// Firebase 설정 객체
const firebaseConfig = {
    // API 키는 공개되어도 Firebase Security Rules로 보호됩니다
    apiKey: "AIzaSyCyG7NvG40GCQivMzxT0-p8dbiLKwfinUE",
    authDomain: "my-app-tesths.firebaseapp.com",
    databaseURL: "https://my-app-tesths-default-rtdb.firebaseio.com",
    projectId: "my-app-tesths",
    storageBucket: "my-app-tesths.firebasestorage.app",
    messagingSenderId: "814938636984",
    appId: "1:814938636984:web:863b1ba8a630dde03dea4d"
};

// 허용된 도메인 목록 (추가 보안)
export const ALLOWED_DOMAINS = [
    'my-app-tesths.web.app',
    'my-app-tesths.firebaseapp.com',
    'localhost',
    '127.0.0.1'
];

// 도메인 검증 함수
export function validateDomain() {
    const currentDomain = window.location.hostname;
    const isAllowed = ALLOWED_DOMAINS.some(domain => 
        currentDomain === domain || currentDomain.endsWith('.' + domain)
    );
    
    if (!isAllowed) {
        console.error('Unauthorized domain:', currentDomain);
        throw new Error('Unauthorized access from this domain');
    }
    
    return true;
}

// 사용자 등록 검증 (추가 보안 레이어)
export const REGISTERED_USERS = [
    'admin', 'player1', 'player2', 'player3', 'player4', 'player5', 
    '사라','현수', '현호', '완재',
    'user1', 'user2', 'user3', 'user4', 'test1', 'test2', 'guest1', 'guest2'
];

function validateUser(userId) {
    return REGISTERED_USERS.includes(userId);
}

// 전역에서 접근 가능하도록 설정
window.firebaseSecurityConfig = {
    firebaseConfig,
    ALLOWED_DOMAINS,
    validateDomain,
    REGISTERED_USERS,
    validateUser
};

// export도 유지 (모듈로 사용할 경우)
export { firebaseConfig, ALLOWED_DOMAINS, validateDomain, REGISTERED_USERS, validateUser };