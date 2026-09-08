# 운영 인수인계 문서

## 1) 설치/실행
```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

## 2) 빌드 확인
```bash
npm run build
```

## 3) .env.local 필수 키(이름만)
다음 키가 있어야 Supabase 연결이 됩니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

값 자체는 문서에 기록하지 마세요.

## 4) 테마 초기화 방법
라이트/다크 토글 저장값을 초기화하려면 브라우저 콘솔에서 아래를 실행하세요.

```js
localStorage.removeItem('theme');
```

저장값이 없으면 기본은 라이트 모드입니다.

## 5) 개발 서버 잠금/포트 충돌 해결
1. 실행 중인 터미널에서 `Ctrl + C`로 먼저 종료
2. 그래도 남아 있으면 아래로 정리

```bash
pkill -f "next dev"
```

필요하면 다시 `npm run dev` 실행

## 6) 수동 체크리스트
- `/treatment`
  - 단계 추가/수정/삭제/위로/아래로 이동
  - 진행중 상태 1개만 유지
  - 단계 이름/순서 검증 및 순서 중복 안내(한글)
- 테마
  - 기본 라이트 시작
  - 토글 즉시 반영
  - 새로고침 후 유지
- 에러 안내
  - 사용자 화면에 영문 DB 에러 원문이 노출되지 않는지 확인

## 7) 음식 검색·맞춤 정보 회귀 검증

Node.js 22.6 이상에서 새 패키지 없이 실행합니다.

```bash
npm test
npm run lint
npm run build
```

검색어 보존·유사 음식, 최근 2개월 및 기사 중복, 식사 맞춤 조합을 검증합니다. 구현 배경과 확인 항목은 [환자 중심 사용성 개선](docs/patient-experience.md)을 참고하세요.

식사 맞춤은 기존 사용자 메타데이터 `iamfine.foodPersonalization`에 저장되며 DB 마이그레이션이 필요하지 않습니다. 로그인 후 `/profile`에서 저장·선택 해제·재방문을 확인하세요.

## 8) 운영 배포

`main` 브랜치 푸시는 기존 Vercel GitHub 연결을 통해 운영 배포됩니다. GitHub 커밋 상태의 `Vercel – iamfine` 성공과 운영 주소 응답을 모두 확인하세요.

운영 주소: https://iamfine-three.vercel.app

## 9) 매일의 말씀과 화면 디자인

- 로그인한 식단 메인의 말씀은 `src/lib/dailyVerse.ts`에 있는 24개 구절을 한국 날짜 기준으로 순환합니다. 한국어 의역임을 화면에 표시하며, 각 구절에 본문 출처가 있습니다. 자정과 탭 복귀 때 갱신됩니다.
- 공통 색상·버튼은 `src/app/globals.css`의 `--ui-*` 토큰을 사용합니다. 건강 소식은 별도의 `--ui-news-*` 색상과 기사 목록으로 구분합니다.
- 내 정보의 카드 여백은 `profileSection`, 입력란은 `profileInput`, 선택 항목은 `profileChoice`에서 관리합니다. 좁은 화면과 큰 글자 모드에서 긴 선택 항목이 한 열로 표시되는지 확인하세요.
- `npm test`에는 말씀의 한국 자정·월말·연말·윤일 전환 검증이 포함됩니다. 화면 변경 시 내 정보의 5개 탭과 밝게/어둡게 보기, 큰 글자 모드를 함께 확인하세요.
