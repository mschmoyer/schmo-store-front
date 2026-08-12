import {
  PASSWORD_MIN_LENGTH,
  characterClasses,
  scorePassword,
  validateEmail,
  validateName,
  validatePassword,
} from '../password';

describe('characterClasses', () => {
  it('counts the distinct classes a password draws on', () => {
    expect(characterClasses('abcdefgh')).toBe(1);
    expect(characterClasses('abcdEFGH')).toBe(2);
    expect(characterClasses('abcdEFG1')).toBe(3);
    expect(characterClasses('abcdEFG1!')).toBe(4);
  });
});

describe('scorePassword', () => {
  it('requires a password at all', () => {
    expect(scorePassword('')).toMatchObject({ score: 0, error: 'This field is required' });
  });

  it('enforces the copy deck floor of 12 characters', () => {
    const result = scorePassword('a'.repeat(PASSWORD_MIN_LENGTH - 1));
    expect(result.score).toBe(0);
    expect(result.error).toBe('Use at least 12 characters');
  });

  it('counts down the characters still needed', () => {
    expect(scorePassword('abcdefghij').suggestion).toBe('2 more characters to go');
    expect(scorePassword('abcdefghijk').suggestion).toBe('1 more character to go');
  });

  it('accepts anything at or above the floor', () => {
    expect(scorePassword('correct-horse').error).toBeNull();
  });

  it('scores longer passwords higher', () => {
    const short = scorePassword('quietriverstn');
    const medium = scorePassword('quietriverstonelm');
    const long = scorePassword('quietriverstonelamps');
    expect(medium.score).toBeGreaterThanOrEqual(short.score);
    expect(long.score).toBeGreaterThanOrEqual(medium.score);
  });

  it('rewards character variety', () => {
    const plain = scorePassword('quietriverst');
    const varied = scorePassword('QuietRiver-7!');
    expect(varied.score).toBeGreaterThan(plain.score);
  });

  it('rates a long all-lowercase passphrase above a short password with a symbol', () => {
    expect(scorePassword('quietriverstonelamps').score).toBeGreaterThanOrEqual(
      scorePassword('Qr7!xkzmwbvp').score
    );
  });

  it('penalises a long password built from very few distinct characters', () => {
    const repetitive = scorePassword('ababababababababab');
    const varied = scorePassword('quietriverstonelamp');
    expect(repetitive.score).toBeLessThan(varied.score);
    expect(repetitive.suggestion).toMatch(/repetition/i);
  });

  it('flags common passwords even when they are long enough', () => {
    const result = scorePassword('password12345');
    expect(result.score).toBe(1);
    expect(result.error).toBeNull();
    expect(result.suggestion).toMatch(/common password/i);
  });

  it('rates a long, varied passphrase as strong with no further advice', () => {
    const result = scorePassword('Vermilion-Depot-77!');
    expect(result.score).toBe(4);
    expect(result.label).toBe('Strong');
    expect(result.suggestion).toBeNull();
  });

  it('rejects absurdly long input rather than scoring it', () => {
    expect(scorePassword('a'.repeat(500)).error).toMatch(/Keep this under/);
  });

  it('never produces a score outside 0..4', () => {
    const samples = ['', 'short', 'quietriverst', 'QuietRiver-7!', 'A'.repeat(60), 'aaaaaaaaaaaaaaaa'];
    for (const sample of samples) {
      const { score } = scorePassword(sample);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
    }
  });
});

describe('validatePassword', () => {
  it('mirrors scorePassword.error, which is what the API route enforces', () => {
    expect(validatePassword('short')).toBe('Use at least 12 characters');
    expect(validatePassword('a-long-enough-one')).toBeNull();
  });
});

describe('validateEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(validateEmail('mike@example.com')).toBeNull();
    expect(validateEmail('  mike+tag@sub.example.co.uk ')).toBeNull();
  });

  it('rejects malformed addresses with the copy deck message', () => {
    for (const bad of ['mike', 'mike@', '@example.com', 'mike@example', 'a b@example.com']) {
      expect(validateEmail(bad)).toBe('Enter a valid email address');
    }
  });

  it('rejects an empty field as required, not as malformed', () => {
    expect(validateEmail('   ')).toBe('This field is required');
  });
});

describe('validateName', () => {
  it('names the field it is complaining about', () => {
    expect(validateName('', 'first')).toBe('Enter your first name');
    expect(validateName('  ', 'last')).toBe('Enter your last name');
  });

  it('accepts a real name', () => {
    expect(validateName('Mike', 'first')).toBeNull();
  });
});
