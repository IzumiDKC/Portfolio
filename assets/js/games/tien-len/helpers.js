export function parseCard(cardCode) {
  const rankValue = Math.floor(cardCode / 10);
  const suitValue = cardCode % 10;

  let suit = '';
  if (suitValue === 0) suit = '♠';
  else if (suitValue === 1) suit = '♣';
  else if (suitValue === 2) suit = '♦';
  else suit = '♥';

  let rank = rankValue.toString();
  if (rankValue === 11) rank = 'J';
  if (rankValue === 12) rank = 'Q';
  if (rankValue === 13) rank = 'K';
  if (rankValue === 14) rank = 'A';
  if (rankValue === 15) rank = '2';

  return { rank, suit, suitValue };
}

export function renderCardHTML(cardCode) {
  const { rank, suit, suitValue } = parseCard(cardCode);
  const colorClass = (suitValue === 0 || suitValue === 1) ? 'black-card' : 'red-card';

  return `
    <div class="tl-card ${colorClass}" data-cardcode="${cardCode}" data-suit="${suitValue}">
      <div class="tl-card-top">${rank}${suit}</div>
      <div class="tl-card-center">${suit}</div>
      <div class="tl-card-bottom">${rank}${suit}</div>
    </div>
  `;
}
