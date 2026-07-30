/**
 * Return the shortest ECMAScript-standard date string that parses back to the same timestamp in every conforming implementation.
 */
export function terseDate(date: Date) {
    const time = date.getTime()

    if (!Number.isFinite(time)) {
        throw new RangeError('Invalid date')
    }

    const year = formatYear(date.getUTCFullYear())
    const month = date.getUTCMonth() + 1
    const day = date.getUTCDate()
    const hour = date.getUTCHours()
    const minute = date.getUTCMinutes()
    const second = date.getUTCSeconds()
    const millisecond = date.getUTCMilliseconds()

    if (month === 1 && day === 1 && hour === 0 && minute === 0 && second === 0 && millisecond === 0) {
        return year
    }

    const monthPart = `${year}-${pad2(month)}`

    if (day === 1 && hour === 0 && minute === 0 && second === 0 && millisecond === 0) {
        return monthPart
    }

    const datePart = `${monthPart}-${pad2(day)}`

    if (hour === 0 && minute === 0 && second === 0 && millisecond === 0) {
        return datePart
    }

    const minutePart = `${datePart}T${pad2(hour)}:${pad2(minute)}`

    if (second === 0 && millisecond === 0) {
        return `${minutePart}Z`
    }

    const secondPart = `${minutePart}:${pad2(second)}`

    if (millisecond === 0) {
        return `${secondPart}Z`
    }

    return `${secondPart}.${String(millisecond).padStart(3, '0')}Z`
}

function pad2(value: number) {
    return String(value).padStart(2, '0')
}

function formatYear(year: number) {
    if (year >= 0 && year <= 9999) {
        return String(year).padStart(4, '0')
    }

    const sign = year < 0 ? '-' : '+'
    return sign + String(Math.abs(year)).padStart(6, '0')
}
