/** 第三章 崇光對決 + ending + post-game chatter. */
import { L } from '../dialogue/logic';
import type { DialogueGraph } from '../dialogue/types';

/** Beat ch3_crossing cutscene: 東星 blocks the Sogo crossing. */
export const CH3_CROSSING: DialogueGraph = {
  id: 'ch3_crossing',
  entry: 'start',
  nodes: {
    start: {
      lines: [
        L('goon', '企喺度！烏鴉哥有令，洪興嘅人，一個都唔准過！', 'Stop right there! Brother Crow\'s orders: not one Hung Hing man gets through!', 'point'),
        L('hoNam', '咁就試吓。', 'Then let\'s find out.'),
      ],
    },
  },
};

/** Beat ch3_boss cutscene: 烏鴉 at the Sogo plaza. */
export const CH3_CROW: DialogueGraph = {
  id: 'ch3_crow',
  entry: 'flip',
  nodes: {
    flip: {
      lines: [
        L('crow', '陳浩南！我等咗你成晚喇！', 'Chan Ho-nam! I\'ve been waiting for you all night!', 'taunt'),
        L('crow', '你知唔知，我最鍾意睇住啲自以為係英雄嘅人，跪喺我面前喊。', 'You know what I love most? Watching so-called heroes kneel in front of me and cry.'),
        L('hoNam', '大佬B喺邊？', 'Where\'s Big B?'),
        L('crow', '大佬B？佢遲啲先到，你做前菜先。', 'Big B? He\'s coming later. You\'re the appetiser.', 'shrug'),
      ],
      next: 'face',
    },
    face: {
      lines: [
        L('hoNam', '烏鴉，你嘅嘢，今晚了斷。', 'Crow. Tonight, you and I settle this.'),
        L('crow', '好！好！夠癲！我鍾意！', 'Good! Good! That\'s crazy enough! I love it!', 'cheer'),
        L('crow', '嚟呀！打死你我就去洪興堂口開香檳！', 'Come on! Once you\'re dead I\'ll pop champagne at Hung Hing\'s hall!', 'taunt'),
      ],
    },
  },
};

/** Ending, part 1: 浩南 stands over the fallen 烏鴉. */
export const ENDING: DialogueGraph = {
  id: 'ending',
  entry: 'crow',
  nodes: {
    crow: {
      lines: [
        L('crow', '嘿，嘿嘿。你打得贏我，打唔贏東星。', 'Heh. Heh heh. You beat me. You can\'t beat Tung Sing.'),
        L('crow', '今晚係我，聽晚係邊個呢？', 'Tonight it was me. Who\'ll it be tomorrow night?'),
        L('hoNam', '邊個嚟，我都喺度。', 'Whoever comes, I\'ll be here.'),
      ],
    },
  },
};

/** Ending, part 2: 山雞 turns up with the brothers once 烏鴉 is down. */
export const ENDING_BROTHERS: DialogueGraph = {
  id: 'ending_brothers',
  entry: 'brothers',
  nodes: {
    brothers: {
      lines: [
        L('chicken', '南哥！南哥！我帶埋班兄弟嚟喇！', 'Nam-gor! Nam-gor! I brought the brothers!', 'cheer'),
        L('chicken', '嘩，烏鴉都瞓低埋？我又遲咗一步！', 'Whoa, even Crow\'s down? I\'m late again!'),
        L('brother', '南哥，B哥收到山雞個CALL，冇去崇光，而家喺堂口等你飲茶。', 'Nam-gor, Big B got Chicken\'s page and skipped SOGO. He\'s waiting for you at the hall for tea.', 'bow'),
        { ...L('hoNam', '好。', 'Good.', 'nod'), face: 'brother' },
      ],
      next: 'supper',
    },
    supper: {
      lines: [
        L('chicken', '今晚宵夜我請！', 'Supper\'s on me tonight!', 'cheer'),
        L('hoNam', '你請？你上次請嗰餐都係我找數。', 'On you? Last time you treated, I paid the bill.'),
        L('chicken', '今次唔同，今次真係我請！大不了揀平啲嗰間囉。', 'This time\'s different, I\'m really paying! We\'ll just pick a cheaper place.', 'shrug'),
      ],
    },
  },
};

/** Ending, closing line over the wide shot. */
export const ENDING_RAIN: DialogueGraph = {
  id: 'ending_rain',
  entry: 'rain',
  nodes: {
    rain: {
      lines: [L('narrator', '銅鑼灣嘅雨，停咗。', 'The rain over Causeway Bay has stopped.')],
    },
  },
};

/** 山雞 after the credits. */
export const CHICKEN_POST: DialogueGraph = {
  id: 'chicken_post',
  entry: 'start',
  with: 'npc_chicken',
  nodes: {
    start: {
      lines: [
        L('chicken', '南哥，魚蛋嬸話以後我哋食魚蛋全部免費呀！', 'Nam-gor, Auntie said fishballs are free for us from now on!', 'cheer'),
        L('hoNam', '真㗎？', 'Really?'),
        L('chicken', '我都話係講笑，佢照收我錢。', 'I said it was a joke. She still charged me.', 'shrug'),
      ],
    },
  },
};

/** 蝦叔 after the credits. */
export const SHRIMP_POST: DialogueGraph = {
  id: 'shrimp_post',
  entry: 'start',
  with: 'npc_shrimp',
  nodes: {
    start: {
      lines: [
        L('shrimp', '烏鴉倒咗，東星唔會就咁算。', 'Crow\'s down, but Tung Sing won\'t let it go.'),
        L('shrimp', '浪大唔緊要，最緊要識得幾時收帆。', 'Big waves don\'t matter. What matters is knowing when to lower the sail.', 'nod'),
        L('hoNam', '明白。', 'Understood.'),
      ],
    },
  },
};
