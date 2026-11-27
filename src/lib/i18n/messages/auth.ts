// The account flow: sign-in, sign-up, the confirmation pages, and the messages the server produces
// for them (Supabase error codes, the password rule, the consent check). Polish is the shape; `en`
// and `uk` are typed as it. Relative imports only, so `node:test` loads it.
//
// The Polish consent text comes from src/lib/consent.ts: it is the binding wording, tied to
// CURRENT_CONSENT_VERSION. The English and Ukrainian consent texts are courtesy translations, shown
// with the Polish original below them. The Ukrainian text waits for a native reader (Open Roadmap
// Question 13).

import type { Locale } from "../locale.ts";
import { CONSENT_LABEL, CONSENT_LINK_TEXT, CONSENT_REQUIRED_MESSAGE } from "../../consent.ts";

export const pl = {
  /** By Supabase auth error code (src/lib/auth-errors.ts). */
  errors: {
    invalid_credentials: "Nieprawidłowy e-mail lub hasło.",
    email_not_confirmed: "Adres e-mail nie został jeszcze potwierdzony. Kliknij link z wiadomości, którą wysłaliśmy.",
    user_already_exists: "Konto z tym adresem e-mail już istnieje. Zaloguj się.",
    email_exists: "Konto z tym adresem e-mail już istnieje. Zaloguj się.",
    weak_password: "Hasło jest za słabe. Użyj co najmniej 10 znaków, w tym małej litery, wielkiej litery i cyfry.",
    over_email_send_rate_limit: "Wysłaliśmy już niedawno wiadomość. Spróbuj ponownie za kilka minut.",
    validation_failed: "Sprawdź poprawność adresu e-mail i hasła.",
    captcha_failed: "Nie udało się sprawdzić, czy formularz wysyła człowiek. Spróbuj ponownie.",
  },
  /** For a code with no message of its own. */
  genericError: "Coś poszło nie tak. Spróbuj ponownie za chwilę.",
  notConfigured: "Supabase nie jest skonfigurowany.",
  emailAndPasswordRequired: "Podaj adres e-mail i hasło.",
  /** The server's answer to a malformed address on the resend form. */
  emailInvalidSentence: "Podaj poprawny adres e-mail.",
  fields: {
    email: "E-mail",
    emailPlaceholder: "ty@przyklad.pl",
    emailRequired: "Podaj adres e-mail",
    emailInvalid: "Podaj poprawny adres e-mail",
    password: "Hasło",
    passwordRequired: "Podaj hasło",
    showPassword: "Pokaż hasło",
    hidePassword: "Ukryj hasło",
  },
  password: {
    tooShort: "Hasło musi mieć co najmniej {min} znaków.",
    needsClasses: "Hasło musi zawierać małą literę, wielką literę i cyfrę.",
    placeholder: "Co najmniej {min} znaków",
    /** Plural forms, picked by `plural` (src/lib/i18n/format.ts). */
    charactersLeft: {
      one: "Jeszcze {count} znak",
      few: "Jeszcze {count} znaki",
      many: "Jeszcze {count} znaków",
      other: "Jeszcze {count} znaku",
    },
  },
  consent: {
    label: CONSENT_LABEL,
    linkText: CONSENT_LINK_TEXT,
    required: CONSENT_REQUIRED_MESSAGE,
    /** Introduces the Polish original under a translated label. Not shown in Polish. */
    bindingNote: "Wiążący jest tekst w języku polskim:",
  },
  signIn: {
    title: "Zaloguj się — SkillNet",
    description:
      "Zaloguj się do SkillNet, żeby zaktualizować swoje umiejętności, dostępność i ustawienia widoczności danych.",
    heading: "Zaloguj się",
    returnNotice: "Ta strona jest dostępna po zalogowaniu. Zaloguj się, a od razu na nią wrócisz.",
    passwordPlaceholder: "Twoje hasło",
    submit: "Zaloguj się",
    pending: "Logowanie...",
    resendLead: "Link nie dotarł albo wygasł? Wyślemy nowy na adres podany powyżej.",
    resendButton: "Wyślij link ponownie",
    noAccount: "Nie masz konta?",
    signUpLink: "Załóż konto",
  },
  signUp: {
    title: "Załóż konto — SkillNet",
    description:
      "Dodaj swoje umiejętności i przybliżoną lokalizację, żeby w razie kryzysu koordynator z gminy mógł poprosić Cię o pomoc.",
    heading: "Załóż konto",
    confirmLabel: "Powtórz hasło",
    confirmPlaceholder: "Wpisz hasło jeszcze raz",
    confirmRequired: "Powtórz hasło",
    mismatch: "Hasła nie są takie same",
    submit: "Załóż konto",
    pending: "Zakładanie konta...",
    goToSignIn: "Przejdź do logowania",
    haveAccount: "Masz już konto?",
    signInLink: "Zaloguj się",
    aside:
      "Z kontem dodasz swoje umiejętności i przybliżoną lokalizację, żeby koordynator gminy mógł Cię znaleźć. Swoje dane zmienisz albo usuniesz w profilu.",
  },
  /** /auth/confirm-email: after sign-up and after a resend. */
  confirmEmail: {
    checkInboxHeading: "Sprawdź skrzynkę e-mail",
    createdHeading: "Konto założone",
    resentBody:
      "Jeśli konto z tym adresem czeka na potwierdzenie, wysłaliśmy na nie nowy link. Wiadomość może dotrzeć po kilku minutach. Sprawdź też folder ze spamem.",
    sentBody:
      "Wysłaliśmy link potwierdzający na Twój adres e-mail. Kliknij go, aby aktywować konto. Jeśli wiadomość nie dotarła, sprawdź folder ze spamem.",
    signedInBody:
      "Twoje konto jest gotowe. Możesz od razu uzupełnić profil: dodaj umiejętności i przybliżoną lokalizację, żeby koordynator mógł Cię znaleźć.",
    autoConfirmedBody: "Twoje konto jest gotowe. Możesz się teraz zalogować.",
    backToSignIn: "Wróć do logowania",
    completeProfile: "Uzupełnij profil",
    goToSignIn: "Przejdź do logowania",
  },
  /** /auth/confirm: the page a confirmation or magic link opens. */
  confirm: {
    alreadySignedIn: {
      heading: "Jesteś już zalogowany",
      bodyWithEmail:
        "W tej przeglądarce trwa sesja konta {email}. Link z wiadomości działa tylko po wylogowaniu: wyloguj się i otwórz go jeszcze raz.",
      body: "W tej przeglądarce trwa już sesja. Link z wiadomości działa tylko po wylogowaniu: wyloguj się i otwórz go jeszcze raz.",
      button: "Wyloguj się",
      aside:
        "Link loguje na konto, do którego został wysłany. Dopóki trwa inna sesja, nie używamy go, żeby nikt nie podmienił Ci konta bez Twojej wiedzy.",
    },
    signIn: {
      heading: "Zaloguj się",
      body: "Kliknij przycisk, aby zalogować się do SkillNet.",
      button: "Zaloguj się",
    },
    confirmAddress: {
      heading: "Potwierdź adres e-mail",
      body: "Ostatni krok: kliknij przycisk, aby potwierdzić adres e-mail i dokończyć zakładanie konta w SkillNet.",
      button: "Potwierdzam",
    },
    aside:
      "Pytamy o kliknięcie, bo programy pocztowe same otwierają linki z wiadomości, żeby sprawdzić, czy są bezpieczne. Bez tego kroku link mógłby się zużyć, zanim do niego zajrzysz.",
  },
  /** /auth/link-wygasl: an expired, used or incomplete link. */
  expired: {
    title: "Link wygasł — SkillNet",
    heading: "Link jest nieważny",
    body: "Link potwierdzający wygasł, został już użyty albo jest niepełny. Podaj adres e-mail, a wyślemy nowy.",
    submit: "Wyślij nowy link",
    alreadyConfirmed: "Konto jest już potwierdzone?",
    signInLink: "Zaloguj się",
  },
};

export type AuthMessages = typeof pl;

export const en: AuthMessages = {
  errors: {
    invalid_credentials: "Incorrect email or password.",
    email_not_confirmed: "The email address has not been confirmed yet. Click the link in the message we sent.",
    user_already_exists: "An account with this email address already exists. Sign in.",
    email_exists: "An account with this email address already exists. Sign in.",
    weak_password:
      "The password is too weak. Use at least 10 characters, including a lowercase letter, an uppercase letter and a digit.",
    over_email_send_rate_limit: "We sent a message a moment ago. Try again in a few minutes.",
    validation_failed: "Check that the email address and password are correct.",
    captcha_failed: "We could not check that a person is sending the form. Try again.",
  },
  genericError: "Something went wrong. Try again in a moment.",
  notConfigured: "Supabase is not configured.",
  emailAndPasswordRequired: "Enter your email address and password.",
  emailInvalidSentence: "Enter a valid email address.",
  fields: {
    email: "Email",
    emailPlaceholder: "you@example.com",
    emailRequired: "Enter your email address",
    emailInvalid: "Enter a valid email address",
    password: "Password",
    passwordRequired: "Enter your password",
    showPassword: "Show password",
    hidePassword: "Hide password",
  },
  password: {
    tooShort: "The password must have at least {min} characters.",
    needsClasses: "The password must contain a lowercase letter, an uppercase letter and a digit.",
    placeholder: "At least {min} characters",
    charactersLeft: {
      one: "{count} more character",
      few: "{count} more characters",
      many: "{count} more characters",
      other: "{count} more characters",
    },
  },
  consent: {
    label:
      "I consent to the processing of my data (email address, approximate location, skills, availability and, optionally, phone number) for the purpose of coordinating help in crisis situations, neighbourly help and neighbourhood courses.",
    linkText: "Information on data processing",
    required: "Tick the consent to data processing to create an account.",
    bindingNote: "This is a translation. The binding text is the Polish original:",
  },
  signIn: {
    title: "Sign in — SkillNet",
    description: "Sign in to SkillNet to update your skills, availability and data visibility settings.",
    heading: "Sign in",
    returnNotice: "This page is available after you sign in. Sign in and you will go straight back to it.",
    passwordPlaceholder: "Your password",
    submit: "Sign in",
    pending: "Signing in...",
    resendLead: "The link did not arrive or has expired? We will send a new one to the address above.",
    resendButton: "Send the link again",
    noAccount: "No account yet?",
    signUpLink: "Create account",
  },
  signUp: {
    title: "Create account — SkillNet",
    description:
      "Add your skills and approximate location so that, in a crisis, the municipal coordinator can ask you for help.",
    heading: "Create account",
    confirmLabel: "Repeat password",
    confirmPlaceholder: "Type the password again",
    confirmRequired: "Repeat the password",
    mismatch: "The passwords do not match",
    submit: "Create account",
    pending: "Creating account...",
    goToSignIn: "Go to sign-in",
    haveAccount: "Already have an account?",
    signInLink: "Sign in",
    aside:
      "With an account you add your skills and approximate location so that the municipal coordinator can find you. You can change or delete your data in your profile.",
  },
  confirmEmail: {
    checkInboxHeading: "Check your inbox",
    createdHeading: "Account created",
    resentBody:
      "If an account with this address is waiting for confirmation, we have sent a new link to it. The message may take a few minutes to arrive. Check your spam folder too.",
    sentBody:
      "We have sent a confirmation link to your email address. Click it to activate your account. If the message has not arrived, check your spam folder.",
    signedInBody:
      "Your account is ready. You can complete your profile right away: add your skills and approximate location so that the coordinator can find you.",
    autoConfirmedBody: "Your account is ready. You can sign in now.",
    backToSignIn: "Back to sign-in",
    completeProfile: "Complete your profile",
    goToSignIn: "Go to sign-in",
  },
  confirm: {
    alreadySignedIn: {
      heading: "You are already signed in",
      bodyWithEmail:
        "This browser has an open session for the account {email}. The link from the message works only after you sign out: sign out and open it again.",
      body: "This browser already has an open session. The link from the message works only after you sign out: sign out and open it again.",
      button: "Sign out",
      aside:
        "The link signs in to the account it was sent to. While another session is open we do not use it, so that nobody can swap your account without you knowing.",
    },
    signIn: {
      heading: "Sign in",
      body: "Click the button to sign in to SkillNet.",
      button: "Sign in",
    },
    confirmAddress: {
      heading: "Confirm your email address",
      body: "The last step: click the button to confirm your email address and finish creating your SkillNet account.",
      button: "Confirm",
    },
    aside:
      "We ask for a click because mail programs open the links in messages by themselves to check that they are safe. Without this step the link could be used up before you look at it.",
  },
  expired: {
    title: "Link expired — SkillNet",
    heading: "The link is not valid",
    body: "The confirmation link has expired, has already been used or is incomplete. Enter your email address and we will send a new one.",
    submit: "Send a new link",
    alreadyConfirmed: "Is the account already confirmed?",
    signInLink: "Sign in",
  },
};

export const uk: AuthMessages = {
  errors: {
    invalid_credentials: "Неправильна електронна адреса або пароль.",
    email_not_confirmed: "Електронну адресу ще не підтверджено. Перейдіть за посиланням із листа, який ми надіслали.",
    user_already_exists: "Акаунт із цією електронною адресою вже існує. Увійдіть.",
    email_exists: "Акаунт із цією електронною адресою вже існує. Увійдіть.",
    weak_password:
      "Пароль заслабкий. Використайте щонайменше 10 символів, зокрема малу літеру, велику літеру та цифру.",
    over_email_send_rate_limit: "Ми нещодавно вже надіслали лист. Спробуйте ще раз за кілька хвилин.",
    validation_failed: "Перевірте правильність електронної адреси та пароля.",
    captcha_failed: "Не вдалося перевірити, чи форму надсилає людина. Спробуйте ще раз.",
  },
  genericError: "Щось пішло не так. Спробуйте ще раз за хвилину.",
  notConfigured: "Supabase не налаштовано.",
  emailAndPasswordRequired: "Вкажіть електронну адресу та пароль.",
  emailInvalidSentence: "Вкажіть правильну електронну адресу.",
  fields: {
    email: "Електронна пошта",
    emailPlaceholder: "name@example.com",
    emailRequired: "Вкажіть електронну адресу",
    emailInvalid: "Вкажіть правильну електронну адресу",
    password: "Пароль",
    passwordRequired: "Вкажіть пароль",
    showPassword: "Показати пароль",
    hidePassword: "Сховати пароль",
  },
  password: {
    tooShort: "Пароль має містити щонайменше {min} символів.",
    needsClasses: "Пароль має містити малу літеру, велику літеру та цифру.",
    placeholder: "Щонайменше {min} символів",
    charactersLeft: {
      one: "Ще {count} символ",
      few: "Ще {count} символи",
      many: "Ще {count} символів",
      other: "Ще {count} символу",
    },
  },
  consent: {
    label:
      "Я даю згоду на обробку моїх даних (електронна адреса, приблизне місцезнаходження, уміння, доступність і, за бажанням, номер телефону) з метою координації допомоги в кризових ситуаціях, сусідської допомоги та сусідських курсів.",
    linkText: "Інформація про обробку даних",
    required: "Позначте згоду на обробку даних, щоб створити акаунт.",
    bindingNote: "Це переклад. Обов’язковим є польський оригінал:",
  },
  signIn: {
    title: "Увійти — SkillNet",
    description: "Увійдіть до SkillNet, щоб оновити свої уміння, доступність і налаштування видимості даних.",
    heading: "Увійти",
    returnNotice: "Ця сторінка доступна після входу. Увійдіть, і ви одразу на неї повернетеся.",
    passwordPlaceholder: "Ваш пароль",
    submit: "Увійти",
    pending: "Вхід...",
    resendLead: "Посилання не надійшло або втратило чинність? Ми надішлемо нове на адресу, вказану вище.",
    resendButton: "Надіслати посилання ще раз",
    noAccount: "Не маєте акаунта?",
    signUpLink: "Створити акаунт",
  },
  signUp: {
    title: "Створити акаунт — SkillNet",
    description:
      "Додайте свої уміння та приблизне місцезнаходження, щоб у разі кризи координатор гміни міг попросити вас про допомогу.",
    heading: "Створити акаунт",
    confirmLabel: "Повторіть пароль",
    confirmPlaceholder: "Введіть пароль ще раз",
    confirmRequired: "Повторіть пароль",
    mismatch: "Паролі не збігаються",
    submit: "Створити акаунт",
    pending: "Створення акаунта...",
    goToSignIn: "Перейти до входу",
    haveAccount: "Уже маєте акаунт?",
    signInLink: "Увійти",
    aside:
      "З акаунтом ви додасте свої уміння та приблизне місцезнаходження, щоб координатор гміни міг вас знайти. Свої дані можна змінити або видалити у профілі.",
  },
  confirmEmail: {
    checkInboxHeading: "Перевірте електронну пошту",
    createdHeading: "Акаунт створено",
    resentBody:
      "Якщо акаунт із цією адресою чекає на підтвердження, ми надіслали на неї нове посилання. Лист може надійти за кілька хвилин. Перевірте також папку зі спамом.",
    sentBody:
      "Ми надіслали посилання для підтвердження на вашу електронну адресу. Перейдіть за ним, щоб активувати акаунт. Якщо лист не надійшов, перевірте папку зі спамом.",
    signedInBody:
      "Ваш акаунт готовий. Можете одразу заповнити профіль: додайте уміння та приблизне місцезнаходження, щоб координатор міг вас знайти.",
    autoConfirmedBody: "Ваш акаунт готовий. Тепер можете увійти.",
    backToSignIn: "Повернутися до входу",
    completeProfile: "Заповнити профіль",
    goToSignIn: "Перейти до входу",
  },
  confirm: {
    alreadySignedIn: {
      heading: "Ви вже увійшли",
      bodyWithEmail:
        "У цьому браузері триває сесія акаунта {email}. Посилання з листа працює лише після виходу: вийдіть і відкрийте його ще раз.",
      body: "У цьому браузері вже триває сесія. Посилання з листа працює лише після виходу: вийдіть і відкрийте його ще раз.",
      button: "Вийти",
      aside:
        "Посилання відкриває акаунт, на адресу якого його надіслано. Поки триває інша сесія, ми його не використовуємо, щоб ніхто не підмінив вам акаунт без вашого відома.",
    },
    signIn: {
      heading: "Увійти",
      body: "Натисніть кнопку, щоб увійти до SkillNet.",
      button: "Увійти",
    },
    confirmAddress: {
      heading: "Підтвердьте електронну адресу",
      body: "Останній крок: натисніть кнопку, щоб підтвердити електронну адресу й завершити створення акаунта в SkillNet.",
      button: "Підтверджую",
    },
    aside:
      "Ми просимо натиснути кнопку, бо поштові програми самі відкривають посилання з листів, щоб перевірити, чи вони безпечні. Без цього кроку посилання могло б бути використане ще до того, як ви його відкриєте.",
  },
  expired: {
    title: "Посилання втратило чинність — SkillNet",
    heading: "Посилання недійсне",
    body: "Посилання для підтвердження втратило чинність, уже було використане або неповне. Вкажіть електронну адресу, і ми надішлемо нове.",
    submit: "Надіслати нове посилання",
    alreadyConfirmed: "Акаунт уже підтверджено?",
    signInLink: "Увійти",
  },
};

export const auth: Record<Locale, AuthMessages> = { pl, en, uk };
