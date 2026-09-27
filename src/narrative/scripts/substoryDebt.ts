/**
 * 支線「魚蛋佬嘅債」: the fishball seller owes a 東星 loan shark. Pay the
 * debt outright (HK$2000) or talk to the collectors (end 'fight').
 */
import {
  L, advanceQuest, completeQuest, giveItem, giveMoney, hasMoney, setFlag, takeItem, takeMoney,
} from '../dialogue/logic';
import type { Choice, DialogueGraph, DialogueNode } from '../dialogue/types';

export const DEBT_AMOUNT = 2000;

const OFFER: Choice[] = [
  { text: `兩千蚊，我幫你還。（HK$${DEBT_AMOUNT}）`, next: 'paid', condition: hasMoney(DEBT_AMOUNT) },
  { text: '等我同佢哋傾吓。', next: 'fight' },
  { text: '等我諗諗。', next: 'later' },
];

/** The three ways out, shared by the first and repeat conversations. */
const OUTCOMES: Record<string, DialogueNode> = {
  paid: {
    lines: [
      L('debtor', '浩南哥，呢，呢個恩我點還呀？', 'Ho-nam, how can I ever repay this?', 'bow'),
      L('hoNam', '以後唔好再借大耳窿。', 'Just stay away from loan sharks.'),
      L('debtor', '一定！一定！呢啲魚蛋同膠布你拎住，唔好嫌少！', 'I will! I will! Take these fishballs and plasters. It\'s not much!'),
    ],
    effects: [
      takeMoney(DEBT_AMOUNT), giveItem('curry_fishball', 5), giveItem('first_aid_plaster', 2),
      completeQuest('sub_debt'), setFlag('debt_done'),
    ],
    end: 'paid',
  },
  fight: {
    lines: [
      L('debtor', '佢哋一陣就過嚟收數，你真係要同佢哋傾？', 'They\'ll be here any minute to collect. You really want to talk to them?', 'cower'),
      L('hoNam', '我嘅傾法，佢哋會明。', 'They\'ll understand my way of talking.'),
    ],
    end: 'fight',
  },
  later: {
    lines: [L('debtor', '唉，你肯聽我講已經好好。佢哋今晚一定會再嚟㗎。', 'Sigh. Thanks for hearing me out. They\'ll be back tonight for sure.', 'shrug')],
  },
};

export const DEBT_INTRO: DialogueGraph = {
  id: 'debt_intro',
  entry: 'start',
  with: 'npc_debtor',
  nodes: {
    start: {
      lines: [
        L('debtor', '浩南哥？唉，你嚟得啱喇，我今次真係死得。', 'Ho-nam? You came at the right time. I\'m really done for this time.', 'cower'),
        L('hoNam', '咩事？', 'What happened?'),
        L('debtor', '上個月個檔要換爐，我一時糊塗，問東星個大耳窿借咗兩千蚊。', 'Last month the stall needed a new stove. Like an idiot, I borrowed two grand from a Tung Sing loan shark.'),
        L('debtor', '九出十三歸呀！利疊利，而家話我爭佢成萬蚊！', 'Ninety out, thirteen back! Interest on interest, now they say I owe ten grand!', 'talkAngry'),
        L('debtor', '佢哋話今晚再唔找數，就拆咗我個檔。', 'They say if I don\'t pay up tonight, they\'ll smash my stall.'),
      ],
      effects: [advanceQuest('sub_debt', 'settle')],
      next: 'ask',
    },
    ask: {
      lines: [
        L('hoNam', '本金幾多？', 'How much was the principal?'),
        L('debtor', '本金就兩千，其餘都係佢哋砌出嚟嘅數。', 'Two grand. The rest is numbers they made up.'),
        L('debtor', '千祈唔好話畀我老婆知呀，佢知道會劏咗我！', 'Whatever you do, don\'t tell my wife. She\'d gut me!', 'cower'),
      ],
      choices: OFFER,
    },
    ...OUTCOMES,
  },
};

export const DEBT_AGAIN: DialogueGraph = {
  id: 'debt_again',
  entry: 'start',
  with: 'npc_debtor',
  nodes: {
    start: {
      lines: [
        L('debtor', '浩南哥，收數佬隨時會嚟，點算好呀？', 'Ho-nam, the collectors could turn up any time. What do I do?', 'cower'),
      ],
      choices: OFFER,
    },
    ...OUTCOMES,
  },
};

/** After 浩南 beat the collectors and took the IOU. */
export const DEBT_AFTER_FIGHT: DialogueGraph = {
  id: 'debt_after_fight',
  entry: 'start',
  with: 'npc_debtor',
  nodes: {
    start: {
      lines: [
        L('hoNam', '借據，你自己燒咗佢。', 'The IOU. Burn it yourself.'),
        L('debtor', '浩南哥！你真係我哋呢條街嘅救星！', 'Ho-nam! You\'re this street\'s saviour!', 'bow'),
        L('debtor', '呢五百蚊係我儲落嘅，仲有魚蛋同藥油，一定要收低！', 'This five hundred is my savings, plus fishballs and ointment. You must take them!'),
        L('hoNam', '留返啲錢換爐啦。', 'Keep some for the stove.'),
        L('debtor', '唔得唔得，你唔收我瞓唔著呀！', 'No, no! If you don\'t take it, I won\'t sleep a wink!', 'shrug'),
      ],
      effects: [
        takeItem('debt_iou'), giveMoney(500), giveItem('curry_fishball', 3), giveItem('tiger_balm'),
        completeQuest('sub_debt'), setFlag('debt_done'),
      ],
    },
  },
};

/** Cutscene before the substory fight: the collectors arrive. */
export const DEBT_COLLECTORS: DialogueGraph = {
  id: 'debt_collectors',
  entry: 'start',
  nodes: {
    start: {
      lines: [
        { ...L('collector', '喂，魚蛋佬，今日夠唔夠數呀？', 'Oi, fishball man. You got our money today?', 'point'), face: 'debtor' },
        L('collector', '咩呀？洪興又點呀，我哋東星收數，天經地義！', 'What? So what if you\'re Hung Hing? Tung Sing collecting debts is the natural order!'),
        L('hoNam', '佢嘅數，我同你計。', 'His debt, you settle with me.'),
      ],
    },
  },
};
