/** 第二章 避風塘. */
import { L, giveItem } from '../dialogue/logic';
import type { DialogueGraph } from '../dialogue/types';

/** Beat ch2_go_typhoon: chapter card, 浩南 heads for the typhoon shelter. */
export const CH2_CARD: DialogueGraph = {
  id: 'ch2_card',
  entry: 'mono',
  nodes: {
    mono: {
      lines: [
        L('hoNam', '蝦叔喺避風塘撐咗半世艇。', 'Uncle Shrimp has spent half his life on the harbour.'),
        L('hoNam', '海上嘅風，佢聞到；岸上嘅風，佢一樣聞到。', 'He can smell the wind at sea. He can smell it ashore just the same.'),
      ],
    },
  },
};

/** Beat ch2_ambush cutscene: 笑面虎 waits on the promenade. */
export const CH2_AMBUSH: DialogueGraph = {
  id: 'ch2_ambush',
  entry: 'start',
  nodes: {
    start: {
      lines: [
        L('tiger', '嘿嘿，陳浩南，等你好耐啦。', 'Heh heh. Chan Ho-nam. Been waiting ages for you.'),
        L('tiger', '烏鴉哥叫我同你講聲：銅鑼灣，今晚轉名。', 'Brother Crow told me to pass on a message: tonight, Causeway Bay changes hands.', 'taunt'),
        L('hoNam', '佢自己唔嚟講？', 'He couldn\'t come say it himself?'),
        L('tiger', '佢冇時間同死人講嘢。', 'He doesn\'t waste time talking to dead men.', 'crossArms'),
        L('tiger', '兄弟們，招呼佢！', 'Boys, show him a good time!', 'point'),
      ],
    },
  },
};

/** Beat ch2_shrimp: 蝦叔 on the pier. The 'crab' ending opens 炒蟹強's menu. */
export const CH2_SHRIMP: DialogueGraph = {
  id: 'ch2_shrimp',
  entry: 'start',
  with: 'npc_shrimp',
  nodes: {
    start: {
      lines: [
        L('shrimp', '後生仔，行路要睇路，行古惑都要睇天。', 'Young man, watch the road when you walk. Walk the triad road, watch the sky too.'),
        L('shrimp', '頭先海傍咁嘈，係咪你？', 'That racket on the promenade just now. Was that you?'),
        L('hoNam', '笑面虎帶人喺度等我。', 'Smiling Tiger was waiting for me with his men.'),
        L('shrimp', '笑面虎都出埋嚟，即係烏鴉今次玩真嘅。', 'If Smiling Tiger\'s out, then Crow means business this time.', 'nod'),
      ],
      next: 'warning',
    },
    warning: {
      lines: [
        L('shrimp', '今晚十二點，大佬B約咗東星嘅人喺崇光門口講數。', 'Midnight tonight, Big B is meeting Tung Sing outside SOGO to settle things.'),
        L('shrimp', '講數係假，伏佢係真。烏鴉喺崇光附近埋咗成班人。', 'The talks are a sham. It\'s an ambush. Crow has a whole crew hidden around SOGO.', 'talkAngry'),
        L('hoNam', '佢BB機CALL唔通？', 'Can\'t anyone page him?'),
        L('shrimp', '佢一出門就唔覆機㗎啦，你又唔係唔知。', 'He never answers his pager once he\'s out. You know that.', 'shrug'),
        L('hoNam', '咁我親身去。', 'Then I\'ll go myself.', 'nod'),
      ],
      next: 'gift',
    },
    gift: {
      lines: [
        L('shrimp', '拎住，兩塊膠布。今晚唔流血就假嘅喇。', 'Take these. Two plasters. You won\'t get through tonight without bleeding.'),
        L('shrimp', '記住，浪大唔緊要，最緊要企得穩。', 'Remember: big waves don\'t matter. What matters is keeping your footing.'),
      ],
      effects: [giveItem('first_aid_plaster', 2)],
      choices: [
        { text: '多謝蝦叔。', next: 'thanks' },
        { text: '有冇炒蟹食先？', next: 'crab' },
      ],
    },
    thanks: {
      lines: [
        L('shrimp', '唔使多謝，平安返嚟飲茶就得。', 'No need to thank me. Just come back in one piece for yum cha.'),
        L('shrimp', '由避風塘返銅鑼灣，沿住軒尼詩道一直行就到崇光。', 'From the shelter, head back along Hennessy Road and you\'ll reach SOGO.', 'point'),
      ],
    },
    crab: {
      lines: [
        L('shrimp', '哈哈，死到臨頭都掛住食，你同你老豆一個樣！', 'Ha! Staring death in the face and still thinking of food. Just like your old man!', 'cheer'),
        L('shrimp', '阿強！炒碟蟹畀呢位後生仔！', 'Keung! Fry up a crab for this young man!', 'point'),
      ],
      end: 'crab',
    },
  },
};

/** 山雞 while 浩南 is on his way to the typhoon shelter. */
export const CHICKEN_CH2: DialogueGraph = {
  id: 'chicken_ch2',
  entry: 'start',
  with: 'npc_chicken',
  nodes: {
    start: {
      lines: [
        L('chicken', '南哥，蝦叔通常喺避風塘碼頭嗰邊食煙。', 'Nam-gor, Uncle Shrimp usually smokes over by the typhoon shelter pier.', 'point'),
        L('chicken', '我喺度召集緊班兄弟，有咩事即刻CALL我，我十分鐘就到！', 'I\'m rounding up the brothers here. Page me if anything happens, I\'ll be there in ten!'),
        L('hoNam', '十分鐘？上次你話十分鐘，我等咗成個鐘。', 'Ten minutes? Last time you said ten, I waited an hour.'),
        L('chicken', '嗰次塞車嘛！', 'There was traffic that time!', 'shrug'),
      ],
    },
  },
};

/** 蝦叔 after the chapter-2 talk, while 崇光 is still pending. */
export const SHRIMP_CH3: DialogueGraph = {
  id: 'shrimp_ch3',
  entry: 'start',
  with: 'npc_shrimp',
  nodes: {
    start: {
      lines: [
        L('shrimp', '仲喺度做乜？崇光嗰邊等緊你！', 'What are you still doing here? SOGO is waiting for you!', 'point'),
        L('shrimp', '沿住軒尼詩道行，過咗電車路就係。', 'Follow Hennessy Road, past the tram tracks.'),
      ],
    },
  },
};
