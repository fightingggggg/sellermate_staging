// Firebase 토큰 발급 스크립트
// 브라우저 콘솔에서 실행하세요

console.log('=== Firebase 토큰 발급 방법 ===');
console.log('');
console.log('1. 브라우저에서 http://localhost:5173 접속');
console.log('2. 로그인 후 개발자 도구(F12) 열기');
console.log('3. Console 탭에서 다음 코드 실행:');
console.log('');
console.log('// 토큰 발급');
console.log('const token = await firebase.auth().currentUser.getIdToken();');
console.log('console.log("토큰:", token);');
console.log('');
console.log('4. 출력된 토큰을 복사해서 test-extension-usage.js의 TEST_TOKEN에 설정');
console.log('');
console.log('=== 또는 다음 코드를 콘솔에 붙여넣기 ===');
console.log(`
(async () => {
  try {
    const token = await firebase.auth().currentUser.getIdToken();
    console.log('=== 발급된 토큰 ===');
    console.log(token);
    console.log('=== 토큰 끝 ===');
    
    // 테스트용 API 호출 예시
    const response = await fetch('/api/extension-usage/status', {
      headers: {
        'Authorization': \`Bearer \${token}\`
      }
    });
    const data = await response.json();
    console.log('=== API 응답 ===');
    console.log(data);
  } catch (error) {
    console.error('오류:', error);
  }
})();
`); 