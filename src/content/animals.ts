export type Animal = { emoji: string; art: string; sound: string }

export const ANIMALS: Record<string, Animal> = {
  'cat':       { emoji: '🐱', art: '  /\\_/\\\n ( o.o )\n  > ^ <', sound: 'Meow!' },
  'dog':       { emoji: '🐶', art: '  / \\__\n (    @\\___\n  /         O\n /   (_____/\n/_____/', sound: 'Woof woof!' },
  'fish':      { emoji: '🐟', art: '  ><(((°>', sound: 'Blub blub!' },
  'bird':      { emoji: '🐦', art: '   ,_,\n  (O,O)\n  /)  )\n --"-"--', sound: 'Tweet tweet!' },
  'snake':     { emoji: '🐍', art: '  ~~~~~sssss\n /     \\\n|  o  o |\n \\  ~  /', sound: 'Hissssss!' },
  'frog':      { emoji: '🐸', art: '  @..@\n (----)\n( >__< )', sound: 'Ribbit!' },
  'cow':       { emoji: '🐄', art: '  (___)\n  (o o)\n /  |  \\', sound: 'Mooooo!' },
  'pig':       { emoji: '🐷', art: '  ^  ^\n (o  o)\n  (oo)', sound: 'Oink oink!' },
  'duck':      { emoji: '🦆', art: '    _\n  <(o )___\n   ( ._> /\n    `---\'', sound: 'Quack quack!' },
  'shark':     { emoji: '🦈', art: '     |\\\n     |  \\\n     |   \\______\n ~~~~|          |~~~~\n     |   /------\n     |  /', sound: 'Dun dun...' },
  'dinosaur':  { emoji: '🦕', art: '            __\n           / _)\n    _.----._/ /\n   /         /\n _/ (  | (  |\n/__.-\'|_|--|_|', sound: 'ROARRR!' },
  'lobster':   { emoji: '🦞', art: ' \\/\\_/\\_/\\/\n  \\_   _/\n  (|o o|)\n   |   |\n  /|   |\\', sound: 'Click click!' },
  'elephant':  { emoji: '🐘', art: '    ___\n   /   \\\n  | o o |\n   \\   /----,\n    | |      \\', sound: 'PHHHRRRRT!' },
  'monkey':    { emoji: '🐵', art: '  .-"-.  \n /  o o \\\n|   <   |\n \\  ~  /', sound: 'Ooh ooh aah aah!' },
  'bear':      { emoji: '🐻', art: ' ʕ •ᴥ• ʔ', sound: 'Grrr!' },
  'rabbit':    { emoji: '🐰', art: ' (\\_/)\n ( •.•)\n />🥕', sound: 'Hop hop!' },
  'owl':       { emoji: '🦉', art: '  ,_,\n (O,O)\n(  V  )\n  ^ ^', sound: 'Hoo hoo!' },
  'turtle':    { emoji: '🐢', art: '    _____\n  .\'     `.\n /  o   o  \\\n|     <     |\n \\  \\___/  /\n  `._____,\'', sound: 'Slow and steady!' },
  'penguin':   { emoji: '🐧', art: '   (o)\n  /| |\\\n _| | |_', sound: 'Waddle waddle!' },
  'lion':      { emoji: '🦁', art: '  /----- \\\n /  o   o  \\\n|    <>    |\n \\  ____  /\n  \\ \\  / /', sound: 'ROARRR!' },
}
