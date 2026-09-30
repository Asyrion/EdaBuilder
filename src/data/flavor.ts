import type { GameState } from '../sim/types';

export interface Chatter {
  text: string;
  when: (s: GameState) => boolean;
}

/** Citizen chatter shown in the message log. Names follow the conventions in docs/EDA_CITY_LORE.md. */
export const FLAVOR_CHATTER: Chatter[] = [
  { text: 'Bram the carter says the cobbles are worth every crown. His axle agrees.', when: (s) => s.population > 30 },
  { text: 'Old Maud left bread on the sill for Aume again. The sparrows are getting fat.', when: (s) => s.happiness > 55 },
  { text: 'Pell the spire-wright says the node hums a half-tone flat tonight. Nobody knows what that means.', when: (s) => s.manaDemand > s.manaSupply * 0.9 },
  { text: 'The lights went out on Tanner Row again. Tammet blames the Veins. The Veins blame Tammet.', when: (s) => s.brownout > 0 },
  { text: "Edda's daughter has candle-eyes. The whole street came to look.", when: (s) => s.population > 80 },
  { text: 'Hollis the sexton sang the Quieting twice today. Says the ground is listening.', when: (s) => s.unquieted > 5 },
  { text: 'Something walked past the well at midnight and did not drink. Corin will not go out after dark.', when: (s) => s.agents.some((a) => a.kind === 2) },
  { text: 'The grass at the edge of the north field has gone grey. Sable says do not step on it.', when: (s) => s.stats.gloamTiles > 400 },
  { text: 'A Ward Lantern lit last night. The whispering stopped. Ossa slept for the first time in a week.', when: (s) => s.coverage.ward.some((v) => v > 0) },
  { text: 'The alchemists on Still Street have started a new batch. The whole ward smells of moonwort and regret.', when: (s) => s.miasma.some((v) => v > 60) },
  { text: 'Tobin says the tithe is too high. Tobin says this every day.', when: (s) => s.taxRates.hearth > 12 },
  { text: 'No tithe on the hearths this season? The Warden-Reeve must have found a Vein of gold.', when: (s) => s.taxRates.hearth < 5 },
  { text: 'Wick the enchanter sold a floating cart to a man from Vell-on-Sable. It floated off without him.', when: (s) => s.educated > 0.3 },
  { text: 'The Veshari drill on the square every dawn. The fountain has never been so full.', when: (s) => s.coverage.fire.some((v) => v > 0) },
  { text: 'They say in Vell-on-Sable that our valley is a real wardlight now. They say it with a sniff.', when: (s) => s.milestone >= 5 },
  { text: 'A carter waited an hour on the bridge. He composed a song about it. It is not a kind song.', when: (s) => s.trafficSmooth.some((v) => v > 180) },
  { text: 'The Academy took three Tallowkin and a Grimmen girl this Thaw. The girl reads leystone like a book.', when: (s) => s.coverage.school.some((v) => v > 0) },
  { text: 'Nobody has work on Hearth Lane. Nobody has bread either. The Watch is nervous.', when: (s) => s.population > 40 && s.employed < s.population * 0.4 },
];

export const TIPS: string[] = [
  'Buildings only grow on zoned tiles that touch a road.',
  'Ley Spires must be within 6 tiles of a ley node or another lit spire.',
  'A lit building lights the buildings touching it. Rows of houses carry mana like a wire.',
  'Craft districts breathe miasma. Keep them downwind of the hearths and away from the well.',
  'Deaths without a Boneyard nearby become the restless. The Watch can lay them down, but only where it patrols.',
  'The Gloam never sleeps. Ward Lanterns burn it back; settled land slows it.',
  'Drawing more mana than the Veins give will cause a wild surge within three days.',
  'Cobbled roads raise land value; lantern-ways carry mana along their whole length.',
  'Info views (keys 1-9, 0) show exactly what each part of the city is missing.',
  'Taxes above 10% make folk grumble; below 10% they cheer, and your treasury weeps.',
];
