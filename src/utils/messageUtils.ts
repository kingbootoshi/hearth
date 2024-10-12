export function splitMessage(text: string, maxLength: number = 2000): string[] {
    if (text.length <= maxLength) {
      return [text];
    }
  
    const parts: string[] = [];
    let currentPart = "";
  
    const words = text.split(" ");
  
    for (const word of words) {
      if ((currentPart + word).length > maxLength) {
        if (currentPart) {
          parts.push(currentPart.trim());
          currentPart = "";
        }
        if (word.length > maxLength) {
          const wordParts = splitLongWord(word, maxLength);
          parts.push(...wordParts.slice(0, -1));
          currentPart = wordParts[wordParts.length - 1];
        } else {
          currentPart = word;
        }
      } else {
        currentPart += (currentPart ? " " : "") + word;
      }
    }
  
    if (currentPart) {
      parts.push(currentPart.trim());
    }
  
    return parts;
  }
  
  function splitLongWord(word: string, maxLength: number): string[] {
    const parts: string[] = [];
    for (let i = 0; i < word.length; i += maxLength) {
      parts.push(word.slice(i, i + maxLength));
    }
    return parts;
  }