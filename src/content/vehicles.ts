export type Vehicle = { emoji: string; art: string; sound: string }

export const VEHICLES: Record<string, Vehicle> = {
  'airplane':    { emoji: '✈️', art: '         __|__\n  --o--o--(_)--o--o--', sound: 'WHOOOOSH!' },
  'plane':       { emoji: '✈️', art: '         __|__\n  --o--o--(_)--o--o--', sound: 'WHOOOOSH!' },
  'truck':       { emoji: '🚛', art: '    ___________\n   |  _  _  _  |___\n   |  TRUCK!   |   |\n   |___________|___|\n    (O)         (O)', sound: 'VROOM VROOM!' },
  'excavator':   { emoji: '🏗️', art: '     ___\n    /   \\-----.\n   |  O  |     \\\n    \\___/  _   |\n   [XXXXX]|_|_/', sound: 'DIG DIG DIG!' },
  'rocket':      { emoji: '🚀', art: '      /\\\n     /  \\\n    | 🚀 |\n    |    |\n   /|    |\\\n   🔥🔥🔥', sound: '3... 2... 1... BLAST OFF!' },
  'train':       { emoji: '🚂', art: '   __    __    __\n  |==|  |==|  |==|\n __|  |__|  |__|  |__\n|   CHOO CHOO!      |\n|___________________|\n  (O)    (O)    (O)', sound: 'CHOO CHOO!' },
  'helicopter':  { emoji: '🚁', art: '   ---+---\n      |\n   .--\'--.\n  / o   o \\\n  \\_______/', sound: 'WHOP WHOP WHOP!' },
  'bulldozer':   { emoji: '🚜', art: '  _________\n |  PUSH!  |____\n |_________|    |\n   (O)     (O)', sound: 'BEEP BEEP BEEP!' },
  'crane':       { emoji: '🏗️', art: '   |\n   |______\n   |      \\---[HOOK]\n   | CRANE|\n   |______|', sound: 'LIFTING!' },
  'boat':        { emoji: '⛵', art: '      |\n     /|\\\n    / | \\\n ~~~~~~~~~~~', sound: 'Splashhh!' },
  'car':         { emoji: '🚗', art: '    ______\n   /|_||_\\`.__\n  (   _    _ _\\\n  =`-(_)--(_)-\'', sound: 'Beep beep!' },
  'bus':         { emoji: '🚌', art: '  ______________\n |  BUS!  [] [] |\n |_____________|\n   (O)      (O)', sound: 'All aboard!' },
}
