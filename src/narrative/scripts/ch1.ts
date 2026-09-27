/** 序幕 + 第一章 波斯富街. */
import { L, giveItem } from '../dialogue/logic';
import type { DialogueGraph } from '../dialogue/types';

/** Intro cutscene: 浩南 walks up Percy Street in the rain; 山雞 pages him. */
export const INTRO: DialogueGraph = {
  id: 'intro',
  entry: 'rain',
  nodes: {
    rain: {
      lines: [
        L('narrator', '一九九六年，銅鑼灣。', 'Causeway Bay, 1996.'),
        L('hoNam', '走開咗半年，銅鑼灣嘅雨，仲係咁大。', 'Six months away, and the Causeway Bay rain is as heavy as ever.'),
      ],
      next: 'page',
    },
    page: {
      lines: [
        { ...L('narrator', 'BB機：「南哥，波斯富街等你，有要緊嘢講。山雞」', 'Pager: "Nam-gor, meet me on Percy Street. Urgent. — Chicken"'), sfx: 'pager_beep' },
        L('hoNam', '又搞乜鬼。', 'What now.', 'phone'),
      ],
    },
  },
};

/** Beat ch1_meet_chicken: 山雞 reports the shakedown. */
export const CH1_CHICKEN: DialogueGraph = {
  id: 'ch1_chicken',
  entry: 'start',
  with: 'npc_chicken',
  nodes: {
    start: {
      lines: [
        L('chicken', '南哥！你終於返嚟喇！', 'Nam-gor! You\'re finally back!', 'cheer'),
        L('hoNam', '咩事咁急？', 'What\'s so urgent?'),
        L('chicken', '東星嗰班友呀！呢兩個禮拜日日過嚟波斯富街收陀地，話呢度以後歸佢哋管。', 'Tung Sing\'s crew. Two weeks now they\'ve been shaking down Percy Street, saying it\'s theirs now.', 'talkAngry'),
        L('chicken', '頭先仲搶埋魚蛋嬸成日嘅生意錢，拖咗入後巷度數緊！', 'Just now they grabbed Auntie\'s whole day\'s takings and dragged it into the back alley!', 'point'),
      ],
      choices: [
        { text: '幾多個人？', next: 'count' },
        { text: '喺邊？', next: 'go' },
      ],
    },
    count: {
      lines: [
        L('chicken', '三個，著住花恤衫，一睇就知係東星啲蛇仔。', 'Three. Flowery shirts. Tung Sing small-fry, easy to spot.'),
        L('chicken', '你一個打三個，實冇問題啦！我幫你睇水！', 'Three on one? Easy for you. I\'ll keep watch!', 'nod'),
        L('hoNam', '你又睇水？', 'Keeping watch again?'),
        L('chicken', '睇水都係好重要嘅崗位嚟㗎！', 'Keeping watch is an important job!', 'shrug'),
      ],
      next: 'go',
    },
    go: {
      lines: [
        L('chicken', '後巷就喺前面，行過去就見到！快啲呀南哥！', 'The alley\'s just up ahead. Hurry, Nam-gor!', 'point'),
        L('hoNam', '喺度等我。', 'Wait here.'),
      ],
    },
  },
};

/** Beat ch1_alley cutscene: three 東星 goons counting the stolen cash. */
export const CH1_ALLEY: DialogueGraph = {
  id: 'ch1_alley',
  entry: 'start',
  nodes: {
    start: {
      lines: [
        { ...L('goon', '哈，一個魚蛋檔都有成千蚊，今晚夠飲喇！', 'Ha, over a grand from one fishball stall. Drinks are on us tonight!', 'cheer'), face: 'goon' },
        L('hoNam', '啲錢唔係你哋嘅。', 'That money isn\'t yours.'),
        L('goon', '你邊條友呀？唔知呢度而家係東星地頭咩？', 'Who the hell are you? Don\'t you know this is Tung Sing turf now?'),
        L('hoNam', '銅鑼灣，由頭到尾都係洪興嘅。', 'Causeway Bay has always been Hung Hing\'s.'),
        L('goon', '洪興？陳浩南？哈！今晚就等我哋三兄弟踩低你成名！', 'Hung Hing? Chan Ho-nam? Ha! Tonight the three of us make our names on you!', 'taunt'),
      ],
    },
  },
};

/** Beat ch1_aftermath, part 1: 山雞 turns up once the dust settles. */
export const CH1_AFTER: DialogueGraph = {
  id: 'ch1_after',
  entry: 'start',
  nodes: {
    start: {
      lines: [
        L('chicken', '南哥！嘩，三個都瞓晒喺度，你都唔留返一個畀我！', 'Nam-gor! Whoa, all three out cold. You didn\'t even save one for me!', 'cheer'),
        L('hoNam', '你睇水睇得好好。', 'Great job keeping watch.'),
        L('chicken', '咁當然，我對眼好利㗎！', 'Of course. I\'ve got sharp eyes!', 'nod'),
        L('hoNam', '走，拎啲錢返去畀魚蛋嬸。', 'Come on. Let\'s get Auntie her money back.'),
      ],
    },
  },
};

/** Beat ch1_aftermath, part 2: back at the curry-fishball stall. */
export const CH1_STALL: DialogueGraph = {
  id: 'ch1_stall',
  entry: 'thanks',
  nodes: {
    thanks: {
      lines: [
        L('auntie', '浩南！真係多得你呀！呢啲係我成日嘅血汗錢嚟㗎！', 'Ho-nam! Thank you so much! That\'s a whole day\'s sweat and blood!', 'bow'),
        L('hoNam', '以後有人嚟搞你，出聲。', 'Anyone bothers you again, just say the word.'),
        L('auntie', '嚟，兩串咖喱魚蛋，攞住路上食，唔准同我客氣！', 'Here, two skewers of curry fishballs for the road. Don\'t you dare refuse!'),
      ],
      effects: [giveItem('curry_fishball', 2)],
      next: 'chicken',
    },
    chicken: {
      lines: [
        { ...L('chicken', '嬸嬸，我呢？我都有份睇水㗎！', 'Auntie, what about me? I kept watch too!'), face: 'auntie' },
        { ...L('auntie', '你上個月仲爭我三十蚊魚蛋錢未還！', 'You still owe me thirty bucks for fishballs from last month!', 'talkAngry'), face: 'chicken' },
        L('chicken', '哎吔，記性咁好嘅。', 'Aiya, what a memory.', 'shrug'),
      ],
      next: 'crow',
    },
    crow: {
      lines: [
        L('chicken', '南哥，講真，東星今次唔係玩玩吓。聽講係烏鴉親自落嚟銅鑼灣插旗。', 'Seriously though, Tung Sing aren\'t messing around. Word is Crow himself is coming to plant his flag here.'),
        L('hoNam', '烏鴉。', 'Crow.'),
        L('chicken', '避風塘嘅蝦叔喺海上撐咗幾十年艇，東星有咩風吹草動，佢一定知。', 'Uncle Shrimp has worked the harbour for decades. If Tung Sing are up to something, he\'ll know.'),
        L('chicken', '波斯富街行到尾，過咗天橋就係避風塘。我去召集班兄弟，有事CALL我！', 'Walk to the end of Percy Street and cross the bridge. I\'ll round up the brothers. Page me if anything happens!', 'point'),
        L('hoNam', '小心啲。', 'Watch yourself.'),
      ],
    },
  },
};
