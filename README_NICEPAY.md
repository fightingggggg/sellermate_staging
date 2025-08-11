# 나이스페이 빌키발급 기능

이 프로젝트는 나이스페이의 빌키발급 기능을 서버 승인 방식으로 구현한 것입니다.

## 기능

- **빌키 발급**: 사용자 카드 정보로 빌키를 발급받아 저장
- **빌키 관리**: 빌키 상태 확인, 삭제 기능
- **자동 결제**: 저장된 빌키로 구독 결제 처리
- **웹훅 처리**: 결제 완료 알림 처리

## 환경 변수 설정

`.env` 파일에 다음 환경 변수를 추가해주세요:

```env
# 나이스페이 API 설정
NICEPAY_CLIENT_ID=your_nicepay_client_id_here
NICEPAY_SECRET_KEY=your_nicepay_secret_key_here

# 기본 URL 설정 (웹훅 콜백용)
BASE_URL=http://localhost:3000
```

## API 엔드포인트

### 1. 빌키 발급 요청
```
POST /api/nicepay/billing-key
```

**요청 본문:**
```json
{
  "uid": "사용자ID",
  "cardNo": "카드번호",
  "expiry": "MM/YY",
  "birth": "YYMMDD",
  "pwd_2digit": "카드비밀번호앞2자리"
}
```

### 2. 빌키 상태 확인
```
GET /api/nicepay/billing-key/:uid
```

### 3. 빌키 삭제
```
DELETE /api/nicepay/billing-key/:uid
```

### 4. 빌키로 결제 요청
```
POST /api/nicepay/payment/billing
```

**요청 본문:**
```json
{
  "uid": "사용자ID",
  "amount": 9900,
  "goodsName": "상품명",
  "orderId": "주문ID"
}
```

### 5. 웹훅 콜백 처리
```
POST /api/nicepay/billing-key/callback
POST /api/nicepay/payment/callback
```

## 사용법

### 1. 클라이언트에서 빌키 발급

```typescript
import { useNicePay } from '@/hooks/useNicePay';

const { requestBillingKey, getBillingKeyStatus } = useNicePay();

// 빌키 발급 요청
const result = await requestBillingKey({
  cardNo: "1234567890123456",
  expiry: "12/25",
  birth: "900101",
  pwd_2digit: "12"
});

// 빌키 상태 확인
const status = await getBillingKeyStatus();
```

### 2. 빌키로 결제

```typescript
const { requestPayment } = useNicePay();

const result = await requestPayment({
  amount: 9900,
  goodsName: "스토어부스터 부스터 플랜",
  orderId: "SUB_1234567890_uid"
});
```

## 데이터베이스 구조

### billingKeyRequests 컬렉션
빌키 발급 요청 정보를 저장합니다.

```typescript
{
  orderId: string;
  status: "PENDING" | "COMPLETED";
  createdAt: Timestamp;
  cardInfo: {
    cardNo: string; // 마스킹 처리됨
    expiry: string;
  };
}
```

### billingKeys 컬렉션
발급된 빌키 정보를 저장합니다.

```typescript
{
  billingKey: string;
  cardCode: string;
  cardName: string;
  cardNo: string;
  expiry: string;
  authToken: string;
  tid: string;
  orderId: string;
  createdAt: Timestamp;
  status: "ACTIVE";
}
```

### payments 컬렉션
결제 정보를 저장합니다.

```typescript
{
  uid: string;
  orderId: string;
  amount: number;
  goodsName: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  billingKey: string;
  createdAt: Timestamp;
  tid?: string;
  completedAt?: Timestamp;
  errorMessage?: string;
  failedAt?: Timestamp;
}
```

### subscriptions 컬렉션
구독 정보를 저장합니다.

```typescript
{
  uid: string;
  orderId: string;
  amount: number;
  status: "ACTIVE";
  startDate: Timestamp;
  endDate: Timestamp;
  plan: "BOOSTER";
}
```

## 보안 고려사항

1. **카드 정보 마스킹**: 카드번호는 마스킹 처리하여 저장
2. **환경 변수**: API 키는 환경 변수로 관리
3. **HTTPS 필수**: 운영 환경에서는 HTTPS 사용 필수
4. **IP 제한**: 나이스페이 관리자에서 IP 제한 설정 권장

## 테스트

1. 나이스페이 샌드박스 환경에서 테스트
2. 테스트 카드 정보 사용
3. 웹훅 테스트 기능 활용

## 주의사항

- 실제 운영 환경에서는 나이스페이 운영계 API 사용
- 카드 정보는 안전하게 관리
- 웹훅 URL은 공개 접근 가능해야 함
- 결제 실패 시 적절한 에러 처리 필요 