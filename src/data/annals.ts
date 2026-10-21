/**
 * The Annals (iteration 55, M14 part 5): every counter the charter keeps, by chapter, so nothing the sim counts is
 * write-only. A test holds it: every key of `stats` is a row here or is listed in ANNALS_INTERNAL with its reason.
 */
import type { GameState } from '../sim/types';

type StatKey = keyof GameState['stats'];

export interface AnnalRow {
  label: string;
  note: string;
  /** a counter in `stats` … */
  stat?: StatKey;
  /** … or a value read elsewhere in the state */
  value?: (s: GameState) => number | string;
}
export interface AnnalChapter { chapter: string; rows: AnnalRow[] }

const n = (v: number) => Math.round(v).toLocaleString();

export const ANNALS: AnnalChapter[] = [
  {
    chapter: 'The folk',
    rows: [
      { label: 'Folk at the peak', stat: 'peakPopulation', note: 'The most folk the city has ever housed.' },
      { label: 'Riots', stat: 'riots', note: 'Five days of unrest over half: a market with too little watch burns, or the Crown is paid.' },
      { label: 'Goods stolen', stat: 'goodsStolen', note: 'Taken from market shelves with little watch while unrest stood over 0.3.' },
      { label: 'Days with a chartered quarter', stat: 'quarterDays', note: 'Days on which at least one district held a charter.' },
      { label: 'Shrines raised for pilgrims', stat: 'pilgrimShrines', note: 'Shrines of Aume built when the welcomed pilgrims came back to ask.' },
      { label: 'Days in good order', value: (s) => s.cleanDays, note: 'Days in a row in the black with no ruins and none of the restless walking.' },
    ],
  },
  {
    chapter: 'Goods & trade',
    rows: [
      { label: 'Goods delivered', stat: 'goodsDelivered', note: 'Goods the carts brought from the works to the markets.' },
      { label: 'Sold to the caravan', stat: 'caravanGoods', note: 'Surplus goods sold to the Belerial caravan at the Trade Depot.' },
      { label: 'Crowns from the caravan', stat: 'caravanCrowns', note: 'What the Belerial caravan paid at its halts: the works\' surplus, the rare goods and the relics it bought.' },
      { label: 'Goods on the Twin Road', stat: 'twinGoods', note: 'Goods carried between this wardlight and its daughter.' },
      { label: 'Trips through the arches', stat: 'portalTrips', note: 'Carts that stepped through a pair of Portal Arches.' },
      { label: 'Barges sent', stat: 'bargeTrips', note: 'Barges that sailed between the moorings.' },
      { label: 'Airship voyages', stat: 'airshipVoyages', note: "The Sky-Dock's airship trading the season's surplus beyond the Gloam." },
      { label: 'Crowns from the airship', stat: 'airshipCrowns', note: 'What those voyages brought home.' },
      { label: 'Goods at the last Thaw feast', stat: 'feastGoods', note: 'Goods the markets gave to the last Thaw-day feast.' },
      { label: 'Artifacts sold today', value: (s) => `${n(s.artifactsSold)} crowns`, note: 'Arcane artifacts sold for crowns today.' },
    ],
  },
  {
    chapter: 'The Crown & the Charter',
    rows: [
      { label: "The Crown's favour", value: (s) => `${n(s.crownFavour)} of 100`, note: '50 is neutral; each point moves the levy and the sector prices 0.3 %; under 20 the next grant is withheld.' },
      { label: 'Thaw levies paid', stat: 'levies', note: "The Crown's levy of 5 % of the treasury above 10,000, each first day of the Thaw." },
      { label: 'Crowns levied', stat: 'levied', note: 'What those levies took.' },
      { label: 'Pleadings with the collector', value: (s) => s.pleadings, note: 'Each makes the next audit harsher.' },
      { label: "The Crown's loan", value: (s) => (s.loan > 0 ? `${n(s.loan)} crowns out` : 'none'), note: '10,000 × the milestone at half a crown in a hundred a day.' },
      { label: 'Days under the debt line', value: (s) => s.bankruptDays, note: 'Five in a row and the Crown revokes the Charter.' },
      { label: 'Sectors bought', stat: 'sectorsBought', note: 'Map sectors added to the Charter.' },
      { label: 'Daughter wardlights', stat: 'daughters', note: 'Charters founded on another node.' },
      { label: 'Relics sold to the Crown', stat: 'relicsSold', note: 'Loose relics sold to the Crown.' },
      { label: 'Charter tasks done', value: (s) => s.questsDone.length, note: "Tasks from the Charter's Ledger completed." },
      { label: 'Tales heard', value: (s) => s.firedEvents.length, note: 'Tales, festivals, petitions and visits answered in this charter.' },
    ],
  },
  {
    chapter: 'The ley',
    rows: [
      { label: 'Wild surges', stat: 'surgesTotal', note: 'Overdrawn ley that broke loose.' },
      { label: 'Surges the Lantern of the Cores took', stat: 'surgesAbsorbed', note: 'Surges absorbed before they struck.' },
      { label: 'Overdraws weathered', stat: 'brownoutsSurvived', note: 'Spells of overdraw that ended without a surge.' },
    ],
  },
  {
    chapter: 'The grey edge',
    rows: [
      { label: 'Gloam tiles now', stat: 'gloamTiles', note: 'Tiles the Gloam holds today.' },
      { label: 'Gloam burned back', stat: 'gloamBurned', note: 'Grey tiles the wards burned clean.' },
      { label: 'Fires', stat: 'firesTotal', note: 'Buildings that caught fire.' },
      { label: 'Hides from game', stat: 'hides', note: "Hides of deer, elk, boar, goats, otters and wolves the lodges brought in (iteration 58)." },
      { label: 'Meat brought in', stat: 'meat', note: 'Meat for the markets\' shelves; what the shelves cannot take is salted for the Gloam road.' },
      { label: 'Trophies', stat: 'trophies', note: 'Antlers, tusks, plumes, wolf heads, a war-tiger or a white hart.' },
      { label: 'Crowns from the hunt', stat: 'huntCrowns', note: 'What the Gloam road paid for hides, salted meat and trophies.' },
      { label: 'Herds driven off', stat: 'herdsLost', note: 'Herds that left as the city took their ground (or the wolves and the winter took them).' },
      { label: 'Herds hunted out', stat: 'herdsHunted', note: 'Herds the hunters took to the last head.' },
      { label: 'Hens the wolves took', stat: 'hensTaken', note: 'Hush nights when wolves came to a dark hearth at the edge.' },
      { label: 'Fish landed', stat: 'fishCaught', note: "Fish the Fishers' Huts brought in from the river and the lake (iteration 60)." },
      { label: 'Fish spoiled', stat: 'fishSpoiled', note: 'Fish no market and no Smokehouse took within two days.' },
      { label: 'Fish smoked', stat: 'fishSmoked', note: 'Fish the Smokehouses took off the huts\' racks.' },
      { label: 'Crowns from smoked fish', stat: 'fishCrowns', note: 'What the Gloam road paid for smoked fish.' },
      { label: 'Homes thatched', stat: 'homesThatched', note: 'Level-1 homes the reed-cutters thatched (a thatch lasts sixty days).' },
      { label: 'Ford days under water', stat: 'fordDaysClosed', note: 'Days a ford stood closed by high water or a flood.' },
      { label: 'Marsh drained', stat: 'marshDrained', note: 'Marsh tiles the Drainage edict turned to meadow.' },
    ],
  },
  {
    chapter: 'The dead',
    rows: [
      { label: 'The restless risen', stat: 'restlessTotal', note: 'Unquieted dead who rose to walk.' },
      { label: 'The restless laid', stat: 'restlessLaid', note: 'Walking dead laid to rest again.' },
      { label: 'Dead the Remembrance stirred', value: (s) => n(s.remembranceDead), note: 'Unquieted dead the Remembrance woke, still to rise.' },
    ],
  },
  {
    chapter: 'Seasons & weather',
    rows: [
      { label: 'Days of rain', stat: 'rainDays', note: 'Bloom rain: fires ×0.4, works +15 %, miasma ×0.3.' },
      { label: 'Days of drought', stat: 'droughtDays', note: 'Ember drought: fires ×2, wells two tiles shorter.' },
      { label: 'Days of blizzard', stat: 'blizzardDays', note: 'Hush blizzard: hearths draw a tenth more mana, no new hound packs.' },
      { label: 'Quiet Hushes', stat: 'quietHush', note: 'Hushes the Gloam never pressed hard.' },
      { label: 'Gale days', stat: 'galeDays', note: 'Days a sea-gale blew over the Patagoi Atoll: the barges stay in, and plain track bridges are under the surf.' },
      { label: 'Floods weathered', stat: 'floodsWeathered', note: 'Hushes a water people came through with the river in flood.' },
    ],
  },
  {
    chapter: 'Walkers',
    rows: [
      { label: 'Dead laid by walkers', stat: 'walkerLayings', note: 'The restless laid by sextons and pilgrims on their rounds.' },
      { label: 'Watch rounds', stat: 'watchRounds', note: 'Patrol legs the watchmen walked, hounds or no hounds.' },
      { label: 'Sexton rounds', stat: 'sextonRounds', note: 'Rounds the sextons walked with their salt, and the dead they laid.' },
      { label: 'Healer visits', stat: 'healerVisits', note: 'Homes tended by healers (+4 happiness for a day).' },
      { label: 'Spire-warden rounds', stat: 'wardenRounds', note: 'Spires checked by the Tallowkin wardens.' },
      { label: 'Scholar trips', stat: 'scholarTrips', note: 'Relics carried to the Academy and named.' },
      { label: 'Pilgrim prayers', stat: 'pilgrimPrayers', note: 'Prayers said at a Temple; each consecrates the pilgrim\'s shrine.' },
      { label: 'Bargeman rounds', stat: 'bargemanRounds', note: 'Flooded homes bailed by bargemen.' },
      { label: 'Brawls parted by sextons', stat: 'brawlsParted', note: 'Sextons who reached a guild brawl on the square with their salt (iteration 73).' },
    ],
  },
  {
    chapter: 'Guilds & relics',
    rows: [
      { label: 'Petitions heard', stat: 'councils', note: 'Petitions brought to the Guildhall.' },
      { label: 'Guild halls raised', stat: 'guildHalls', note: 'Halls a pleased guild built.' },
      { label: 'Guild wars', stat: 'guildWars', note: 'Rival guilds that came to blows.' },
      { label: 'Guild charters', stat: 'guildCharters', note: 'Charters granted to a guild.' },
      { label: 'Relics brought up', stat: 'relics', note: 'Relics the Ruin Delve found.' },
      { label: 'Relics auctioned', stat: 'relicsAuctioned', note: 'Loose relics sold to the caravan.' },
      { label: 'Loose relics', value: (s) => s.relicStock, note: 'Relics in store, not yet sold or studied.' },
      { label: 'Relic sets entire', value: (s) => s.relics.complete.length, note: 'Sets catalogued whole by an Academy.' },
    ],
  },
  {
    chapter: 'The land',
    rows: [
      { label: 'Ground reshaped', stat: 'terraformed', note: 'Every level, delve, fill or cut.' },
      { label: 'Stone cut', stat: 'stoneCut', note: 'Hills levelled, ground delved and rubble: what the Grimmen count as stone.' },
      { label: 'Dev tools used', stat: 'devUses', note: "The Warden-Reeve's hand in the ley: marks the daily result." },
    ],
  },
];

/** Fields of `stats` that are timers, streaks or flags, not counters: they stay off the page, each for its reason. */
export const ANNALS_INTERNAL: Partial<Record<StatKey, string>> = {
  lastCaravanDay: "the caravan's rhythm: the day it last halted",
  lastCaravanCrowns: "the caravan's last take, for the Budget's row",
  lastFeastDay: 'the day of the last Thaw feast, for the forecast',
  brownoutOpen: 'a flag while an overdraw is running',
  hushPressureBreaks: 'days of the current Hush with high pressure, reset each Hush',
  floodDays: 'days of the current Hush in flood, reset each Hush',
  fullDays: 'a streak of days with no market short, read by quests',
};
