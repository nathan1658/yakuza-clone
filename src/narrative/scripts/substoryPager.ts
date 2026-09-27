/**
 * 支線「失落嘅BB機」: 阿芝 lost her pager on Hennessy Road. The pager can be
 * found before or after meeting her; both routes end in the same reunion.
 */
import { L, advanceQuest, completeQuest, giveItem, giveMoney, setFlag, takeItem } from '../dialogue/logic';
import type { DialogueGraph, DialogueNode } from '../dialogue/types';

const REUNION: DialogueNode = {
  lines: [
    L('ahChi', '等我睇吓個留言先。', 'Let me read the message first.', 'phone'),
    L('ahChi', '五二零，一三一四！', '520 1314: "I love you forever!"', 'cheer'),
    L('ahChi', '佢終於肯講喇！浩南哥，真係多謝你！', 'He finally said it! Ho-nam, thank you so much!', 'bow'),
    L('ahChi', '呢八百蚊同杯奶茶，當我請你，唔好推呀！', 'This eight hundred and a milk tea are my treat. Don\'t say no!'),
    L('hoNam', '覆機啦，佢等緊。', 'Page him back. He\'s waiting.'),
  ],
  effects: [
    takeItem('pager_lost'), giveMoney(800), giveItem('milk_tea'),
    completeQuest('sub_pager'), setFlag('pager_done'),
  ],
};

export const PAGER_INTRO: DialogueGraph = {
  id: 'pager_intro',
  entry: 'start',
  with: 'npc_pager_owner',
  nodes: {
    start: {
      lines: [
        L('ahChi', '唉，死喇死喇，點算呀？', 'Oh no, oh no, what do I do?', 'cower'),
        L('hoNam', '咩事？', 'What\'s wrong?'),
        L('ahChi', '我部BB機呀！頭先落電車嗰陣仲喺度，一轉頭就唔見咗！', 'My pager! I had it getting off the tram, then it was gone!'),
        L('ahChi', '入面有我男朋友留畀我嘅留言，我都未睇㗎！', 'There\'s a message from my boyfriend on it, and I haven\'t even read it!'),
      ],
      choices: [
        { text: '我幫你搵吓。', next: 'help' },
        { text: '再買過部咪得囉。', next: 'cold' },
      ],
    },
    help: {
      lines: [
        L('ahChi', '真㗎？應該就喺呢頭附近跌咗，紅色殼㗎！', 'Really? It must have dropped around here. It\'s got a red case!', 'point'),
      ],
      effects: [advanceQuest('sub_pager', 'find')],
    },
    cold: {
      lines: [
        L('ahChi', '買過部都冇咗個留言呀！佢好少講心事㗎！', 'A new one won\'t have the message! He hardly ever says how he feels!', 'talkAngry'),
        L('hoNam', '好啦，我幫你睇吓。', 'Fine. I\'ll take a look.'),
        L('ahChi', '應該就喺呢頭附近，紅色殼㗎！', 'It should be around here somewhere. Red case!', 'point'),
      ],
      effects: [advanceQuest('sub_pager', 'find')],
    },
  },
};

export const PAGER_WAITING: DialogueGraph = {
  id: 'pager_waiting',
  entry: 'start',
  with: 'npc_pager_owner',
  nodes: {
    start: {
      lines: [
        L('ahChi', '搵唔搵到呀？就喺呢頭附近㗎，紅色殼！', 'Any luck? It\'s around here somewhere. Red case!', 'phone'),
        L('ahChi', '佢而家一定以為我唔睬佢，死喇！', 'He must think I\'m ignoring him. I\'m dead!'),
      ],
    },
  },
};

/** 浩南 found the pager before meeting 阿芝. */
export const PAGER_RETURN_SURPRISE: DialogueGraph = {
  id: 'pager_return_surprise',
  entry: 'start',
  with: 'npc_pager_owner',
  nodes: {
    start: {
      lines: [
        L('ahChi', '咦？你手上嗰部，係咪我部BB機呀？', 'Hey? That one in your hand, is that my pager?', 'point'),
        L('hoNam', '喺街邊執到。', 'Found it on the street.'),
        L('ahChi', '係呀係呀！紅色殼，貼住張Hello Kitty貼紙，實係我嘅！', 'Yes, yes! Red case, Hello Kitty sticker. It\'s definitely mine!', 'cheer'),
      ],
      next: 'reunion',
    },
    reunion: REUNION,
  },
};

export const PAGER_RETURN: DialogueGraph = {
  id: 'pager_return',
  entry: 'start',
  with: 'npc_pager_owner',
  nodes: {
    start: {
      lines: [
        L('hoNam', '紅色殼，係咪呢部？', 'Red case. This the one?'),
        L('ahChi', '係呀！就係佢！', 'Yes! That\'s it!', 'cheer'),
      ],
      next: 'reunion',
    },
    reunion: REUNION,
  },
};
