// ТЕСТОВЫЙ ИВЕНТ для разработки движка. Будет заменён реальным контентом.
window.GAME_CONTENT = window.GAME_CONTENT || { events: [] };
window.GAME_CONTENT.events.push({
  id: "sample",
  title: "Тестовый ивент",
  subtitle: "Место, где проверяют движок.",
  where: "на тестовом ивенте",
  emoji: "🧪",
  intro: "Ты заходишь в зал. Все делают вид, что заняты. Ты тоже.",
  picks: 3,
  encounters: [
    {
      id: "sample_one",
      npc: { name: "Кирилл", title: "Founder, visionary, ex-всё", emoji: "🧢" },
      text: "«Слушай, а ты чем занимаешься? Мы сейчас как раз ищем людей в экосистему».",
      options: [
        { text: "Рассказать про свой проект", result: "Он кивал. Потом сказал «круто» и ушёл к столу с едой.", energy: -10, cringe: 5, clout: 5, flags: ["pitched"] },
        { text: "«Давай на связи, скину презу»", result: "Он записал твой телеграм. В заметки. В папку «Потом».", energy: -5, clout: 5, contact: { name: "Кирилл", title: "founder", kind: "empty", note: "в папке «Потом»" }, flags: ["said_davai"] },
        { text: "Честно: «Сейчас ничем. Думаю»", result: "Пауза. Потом он сказал: «Я тоже». Это был самый честный разговор вечера.", energy: 5, cringe: 10, clout: -5, contact: { name: "Кирилл", title: "честный founder", kind: "real" }, flags: ["honest"] }
      ]
    },
    {
      id: "sample_two",
      roles: ["designer"],
      npc: { name: "Марина", title: "Бренд-менеджер, «у нас семья»", emoji: "💼" },
      text: "«Ой, ты же дизайнер! Нам как раз логотип нужен, по-быстрому. Бюджета пока нет, но кейс будет классный».",
      options: [
        { text: "«Конечно, скинь бриф»", result: "Бриф пришёл голосовым на 6 минут.", energy: -15, cringe: 10, flags: ["free_work"] },
        { text: "«А какой бюджет?»", result: "Пауза длилась дольше, чем прошлый проект.", cringe: 15, clout: 10, flags: ["ask_budget"] },
        { text: "Сделать вид, что не услышал", result: "Ты ушёл в телефон. Телефон был пуст.", energy: -5, cringe: 20, flags: ["phone_hide"] }
      ]
    },
    {
      id: "sample_three",
      final: true,
      npc: { name: "Гардероб", title: "Единственный нормальный человек", emoji: "🧥" },
      text: "Вечер заканчивается. Гардеробщица смотрит на тебя с пониманием.",
      options: [
        { text: "«Спасибо, хорошего вечера»", result: "Она улыбнулась. Это был лучший контакт за вечер.", energy: 5, clout: 0 },
        { text: "Забыть номерок, искать 10 минут", result: "Очередь за тобой обсуждала твою куртку.", cringe: 25, energy: -10 },
        { text: "Уйти без куртки, чтобы не стоять в очереди", result: "Куртка осталась на ивенте. Как и ты — в их сторис.", cringe: 10, energy: -5, clout: 5 }
      ]
    },
    {
      id: "sample_chain",
      chained: true,
      npc: { name: "Кирилл", title: "Снова он", emoji: "🧢" },
      text: "«А, это снова ты! Так и не понял, чем ты занимаешься».",
      options: [
        { text: "Повторить", result: "Он снова кивнул.", energy: -10, cringe: 15 },
        { text: "«Я тоже»", result: "Вы посмеялись. Контакт.", clout: 5, contact: { name: "Кирилл", title: "founder", kind: "real" } }
      ]
    }
  ]
});
