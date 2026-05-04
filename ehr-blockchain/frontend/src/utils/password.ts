export type PasswordStrength = {
    score: 0 | 1 | 2 | 3 | 4
    label: 'Empty' | 'Weak' | 'Fair' | 'Good' | 'Strong'
    isAcceptable: boolean
    suggestions: string[]
}

/**
 * Score a password 0..4 based on length + character classes.
 * isAcceptable is true at "Fair" and above; the UI rejects "Weak".
 * Mirrors the server-side rule in backend/src/services/auth_service.rs.
 */
export function passwordStrength(pw: string): PasswordStrength {
    if (!pw) return { score: 0, label: 'Empty', isAcceptable: false, suggestions: [] }

    const checks = {
        length: pw.length >= 8,
        upper: /[A-Z]/.test(pw),
        lower: /[a-z]/.test(pw),
        digit: /[0-9]/.test(pw),
        special: /[^A-Za-z0-9]/.test(pw),
    }

    const suggestions: string[] = []
    if (!checks.length) suggestions.push('8+ characters')
    if (!checks.upper) suggestions.push('an uppercase letter')
    if (!checks.lower) suggestions.push('a lowercase letter')
    if (!checks.digit) suggestions.push('a number')
    if (!checks.special) suggestions.push('a symbol')

    let score: PasswordStrength['score'] = 0
    if (!checks.length) {
        score = 1
    } else {
        const others = [checks.upper, checks.lower, checks.digit, checks.special].filter(Boolean).length
        if (others <= 1) score = 1
        else if (others === 2) score = 2
        else if (others === 3) score = 3
        else score = 4
    }

    const label: PasswordStrength['label'] =
        score === 0 ? 'Empty' : score === 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong'

    return {
        score,
        label,
        isAcceptable: score >= 2,
        suggestions,
    }
}
