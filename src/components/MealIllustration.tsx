import type { MealSlot } from '@/lib/dietEngine';

type MealIllustrationProps = {
    slot: MealSlot;
    className?: string;
};

export default function MealIllustration({ slot, className }: MealIllustrationProps) {
    return (
        <svg
            viewBox="0 0 80 80"
            width="80"
            height="80"
            fill="none"
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            {slot === 'breakfast' && (
                <g strokeLinecap="round" strokeLinejoin="round">
                    <g stroke="#E8A22A" strokeWidth="2.5">
                        <path d="M58 8v4m0 26v4M41 25h4m26 0h3M46 13l3 3m18 18 3 3m0-24-3 3" />
                    </g>
                    <circle cx="58" cy="25" r="9" fill="#F4BE46" />
                    <ellipse cx="39" cy="66" rx="30" ry="5" fill="#D5E5DF" />
                    <path d="M17 55V32c-5-3-5-9-1-13 5-6 23-6 29 0 4 4 4 10-1 13v23a5 5 0 0 1-5 5H22a5 5 0 0 1-5-5Z" fill="#C17A3A" />
                    <path d="M22 53V30c-5-3-5-6-2-9 4-4 18-4 22 0 3 3 2 6-3 9v23a2 2 0 0 1-2 2H24a2 2 0 0 1-2-2Z" fill="#F5D696" />
                    <path d="m28 29 6 4m-8 8 5 3" stroke="#DBAE67" strokeWidth="2.5" />
                    <path d="M38 42c2-7 9-10 15-6 4 2 4 6 8 8 7 2 10 8 6 14-3 5-9 5-13 5-4 3-12 3-15-1-8-1-11-7-7-13 1-3 3-5 6-7Z" fill="#FFFDF3" stroke="#E6D5AE" strokeWidth="1.5" />
                    <circle cx="49" cy="49" r="8" fill="#EDAC27" />
                    <path d="M46 45c1-1 3-2 5-1" stroke="#FFDB74" strokeWidth="2.5" />
                    <path d="m61 58 3-2m-25 2 2 1" stroke="#6F8A50" strokeWidth="2" />
                </g>
            )}
            {slot === 'lunch' && (
                <g strokeLinecap="round" strokeLinejoin="round">
                    <path d="m55 14 13-4m-9 10 12-2" stroke="#C08753" strokeWidth="3" />
                    <path d="M13 40c0-13 12-22 27-22s27 9 27 22" fill="#F9E9D3" />
                    <path d="M18 35c-3-5 1-9 5-9 0-5 7-7 10-3 5-3 11 0 11 5 6 1 7 8 3 11Z" fill="#FFFDF5" />
                    <path d="m23 31 3-1m6-3 2 2m3 6 3-1" stroke="#DDCBAA" strokeWidth="2" />
                    <path d="M46 22c5-7 13-6 15-1 6-1 9 5 5 10 5 4 2 10-4 10H45Z" fill="#628A55" />
                    <path d="m57 25-3 15m0-7 6-2" stroke="#CAE0A1" strokeWidth="2" />
                    <path d="M40 34c3-6 9-8 14-4l5 5-5 8-18-3Z" fill="#E9A347" />
                    <path d="m44 34 7 4" stroke="#F8D59C" strokeWidth="2" />
                    <path d="M11 39h58c-2 17-12 27-29 27S13 56 11 39Z" fill="#D96E56" />
                    <path d="M12 40h56" stroke="#F4B19A" strokeWidth="4" />
                    <path d="M23 47c3 7 8 10 15 11" stroke="#EFA08A" strokeWidth="3" />
                    <path d="M31 66h18" stroke="#B35543" strokeWidth="4" />
                </g>
            )}
            {slot === 'dinner' && (
                <g strokeLinecap="round" strokeLinejoin="round">
                    <path d="M61 9a12 12 0 1 0 10 18c-10 1-15-8-10-18Z" fill="#A79AD4" />
                    <path d="M40 13v6m-3-3h6M73 36v4m-2-2h4" stroke="#B9AFDE" strokeWidth="2" />
                    <ellipse cx="38" cy="49" rx="30" ry="22" fill="#D7DEED" />
                    <ellipse cx="38" cy="48" rx="24" ry="17" fill="#F9F8F5" />
                    <path d="M23 42c-3-4-1-10 4-10 3-5 9-4 11 0 5-1 9 3 7 8l-6 8-17 1Z" fill="#7A996C" />
                    <path d="m31 36 3 12m0-6 5-4" stroke="#CBDCAF" strokeWidth="2" />
                    <path d="m30 48 16-10c4-2 9 0 11 4l3 6c2 4 0 8-4 10l-11 4c-4 1-7 0-9-3l-7-6c-2-2-1-4 1-5Z" fill="#DB9475" />
                    <path d="m40 45 9 13m-2-17 9 12" stroke="#F5CFAD" strokeWidth="3" />
                    <path d="M19 53c1-4 6-5 9-1s1 9-4 9c-4 0-7-4-5-8Z" fill="#E3B65C" />
                    <path d="m21 54 4 3" stroke="#F8DD98" strokeWidth="2" />
                    <path d="M7 28v12m-4-12v6c0 3 8 3 8 0v-6M7 39v21" stroke="#8996B1" strokeWidth="2.5" />
                </g>
            )}
            {slot === 'snack' && (
                <g strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="40" cy="68" rx="28" ry="4" fill="#E1E8D5" />
                    <path d="M28 26c-3-7-2-12 0-16" stroke="#8E714E" strokeWidth="3" />
                    <path d="M29 20c1-9 10-12 17-8-2 8-9 12-17 8Z" fill="#739359" />
                    <path d="M29 29c9-7 22-2 23 11 2 14-9 27-18 27-3 0-5-2-7-2s-4 2-7 1C7 61 6 41 14 32c4-5 10-6 15-3Z" fill="#DE8365" />
                    <path d="M18 36c-3 4-3 9-2 12" stroke="#F0B397" strokeWidth="3" />
                    <path d="M33 49c0-12 9-22 22-22 12 0 19 9 19 20 0 12-9 21-21 21-11 0-20-8-20-19Z" fill="#E7B747" />
                    <circle cx="54" cy="48" r="15" fill="#FAE4A6" />
                    <path d="M54 36v9l-8-4a11 11 0 0 1 8-5Zm4 1a11 11 0 0 1 7 7l-9 2 2-9Zm8 11a11 11 0 0 1-5 9l-5-7 10-2ZM57 59a11 11 0 0 1-10-2l6-7 4 9Zm-13-5a11 11 0 0 1-1-10l8 4-7 6Z" fill="#EAA94B" />
                </g>
            )}
        </svg>
    );
}
