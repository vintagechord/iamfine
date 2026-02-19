# Project rules (must follow)
- Make changes in SMALL steps. One step = one file or one focused change.
- After each step: summarize what changed + what to test.
- Prefer safe, minimal diffs. Do NOT refactor unless asked.
- Never modify database schemas unless explicitly requested.
- Never touch secrets. Do not print env values.
- Use Next.js App Router patterns. TypeScript only.
- Use Supabase client from src/lib/supabaseClient.ts.
- For any new page: create route + basic UI + happy-path first.
- If unsure, ask for confirmation before destructive changes.
“한 번에 최대 1~2개 파일만 변경”
“새 패키지 설치 금지(요청 시만)”