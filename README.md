This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 식사량과 복약 참고

- 개인 식사량은 프로필과 질환·증상의 적용 조건을 확인한 참고 범위입니다. 정보 부족이나 별도 영양 관리가 필요한 상태에서는 계산을 보류하며, 에너지·단백질 목표를 임의로 처방하지 않습니다.
- 계산 가능한 경우 선택한 끼니의 예시 분량을 영양 그래프에 함께 적용합니다. 실제 섭취 기록이나 의료진의 개별 안내를 대신하지 않습니다.
- 복약 체크는 저장 성공 후 완료로 표시하고, 미래 날짜는 체크할 수 없는 **복용 예정**으로 표시합니다.

산정 근거·보류 조건·검증 범위는 [식단 영양 문서](docs/meal-nutrition.md)를 참고하세요.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
