// 월별 사용량 시뮬레이션 테스트 스크립트
// 사용법: node test-extension-usage.js

const BASE_URL = 'http://localhost:5005';

// 테스트용 사용자 토큰 (실제로는 Firebase에서 발급받아야 함)
const TEST_TOKEN = 'your-test-token-here';

async function makeRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_TOKEN}`
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();
    
    console.log(`[${method}] ${endpoint}:`, {
      status: response.status,
      data: data
    });
    
    return { status: response.status, data };
  } catch (error) {
    console.error(`[${method}] ${endpoint} 오류:`, error.message);
    return { status: 500, error: error.message };
  }
}

async function simulateMonthlyUsage() {
  console.log('=== 월별 사용량 시뮬레이션 테스트 ===\n');

  // 1. 현재 월 사용량 조회
  console.log('1. 현재 월 사용량 조회');
  await makeRequest('/api/extension-usage/status');
  console.log('');

  // 2. 이번 달 사용량을 20회로 설정 (제한에 도달)
  console.log('2. 이번 달 사용량을 20회로 설정 (제한에 도달)');
  const currentMonth = new Date().toISOString().slice(0, 7).replace('-', '');
  await makeRequest('/api/extension-usage/simulate', 'POST', {
    action: 'set',
    targetMonth: currentMonth,
    targetCount: 20
  });
  console.log('');

  // 3. 다시 현재 월 사용량 조회 (제한에 도달했는지 확인)
  console.log('3. 현재 월 사용량 재조회 (제한 도달 확인)');
  await makeRequest('/api/extension-usage/status');
  console.log('');

  // 4. 다음 달 사용량 조회 (새로운 달이므로 0회여야 함)
  console.log('4. 다음 달 사용량 조회 (새로운 달)');
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthStr = nextMonth.getFullYear().toString() + 
                      String(nextMonth.getMonth() + 1).padStart(2, '0');
  
  await makeRequest('/api/extension-usage/simulate', 'POST', {
    action: 'get',
    targetMonth: nextMonthStr
  });
  console.log('');

  // 5. 다음 달에서 사용량 소비 시뮬레이션
  console.log('5. 다음 달에서 사용량 소비 시뮬레이션');
  await makeRequest('/api/extension-usage/simulate', 'POST', {
    action: 'consume',
    targetMonth: nextMonthStr
  });
  console.log('');

  // 6. 전체 월별 사용량 목록 조회
  console.log('6. 전체 월별 사용량 목록 조회');
  await makeRequest('/api/extension-usage/simulate', 'POST', {
    action: 'list'
  });
  console.log('');

  // 7. 이번 달에서 추가 소비 시도 (제한 초과)
  console.log('7. 이번 달에서 추가 소비 시도 (제한 초과)');
  await makeRequest('/api/extension-usage/simulate', 'POST', {
    action: 'consume',
    targetMonth: currentMonth
  });
  console.log('');

  console.log('=== 시뮬레이션 완료 ===');
}

// 실제 API 호출을 위한 함수 (토큰이 있을 때만 실행)
async function testWithRealToken() {
  console.log('실제 토큰으로 테스트하려면 TEST_TOKEN을 설정하세요.');
  console.log('Firebase에서 발급받은 ID 토큰을 사용해야 합니다.\n');
}

// 스크립트 실행
if (TEST_TOKEN === 'your-test-token-here') {
  testWithRealToken();
} else {
  simulateMonthlyUsage();
}

// 시뮬레이션 결과 예상
console.log('\n=== 예상 결과 ===');
console.log('1. 현재 월: 0회 (초기 상태)');
console.log('2. 현재 월: 20회로 설정됨');
console.log('3. 현재 월: 20/20 (제한 도달)');
console.log('4. 다음 달: 0회 (새로운 달)');
console.log('5. 다음 달: 1회 (소비 후)');
console.log('6. 전체 목록: 현재월(20회), 다음달(1회)');
console.log('7. 현재 월: 제한 초과로 거부됨 (429 상태)');

console.log('\n=== 핵심 포인트 ===');
console.log('• 월별로 독립적인 카운터가 생성됨');
console.log('• 새로운 달이 되면 자동으로 0부터 시작');
console.log('• Basic 멤버십은 월 20회 제한');
console.log('• 문서 ID: {uid}_{YYYYMM} 형식'); 