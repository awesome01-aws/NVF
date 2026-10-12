import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const csvData = `Day/Date (Day 1),Client Name (Client Mark),Number of Eggs,Candling Date (Day 8),Transfer into Hatcher (Day 18),Hatching Date (Day 21),Amount Due (FCFA),Amount Paid (FCFA),Number of eggs after candling,Number of Chicks Hatched,Clients Contact
11/14/2023,NDAH SIMON(NS),87,11/22/2023,12/2/2023,12/5/2023,"13,000 FCFA","13,000 FCFA",78,65,677495727
11/17/2023,Rapheal(RF),7,11/24/2023,12/4/2023,12/7/2023,"1,400 FCFA","1,400 FCFA",5,5,677058935
11/17/2023,TASA G(TG),17,11/24/2023,12/4/2023,12/7/2023,"3,400 FCFA","3,400 FCFA",14,2,677763131
11/19/2023,FAI R(FR),23,11/26/2023,12/6/2023,12/9/2023,"4,600 FCFA","4,000 FCFA",20,15,675885076
11/23/2023,NDAH SIMON(NS),116,11/30/2023,12/10/2023,12/13/2023,"18,200 FCFA","18,200 FCFA",101,91,
11/30/2023,MENDONG(MR),9,12/7/2023,12/17/2023,12/20/2023,"1,800 FCFA","1,800 FCFA",8,5,682928850
12/1/2023,NDAH SIMON(NS),115,12/8/2023,12/18/2023,12/21/2023,"16,400 FCFA","16,400 FCFA",107,82,
12/2/2023,Rapheal(RF),7,12/9/2023,12/19/2023,12/22/2023,"1,400 FCFA","1,400 FCFA",6,5,
12/2/2023,NAPOLEON(MF),21,12/9/2023,12/19/2023,12/22/2023,"4,200 FCFA","3,000 FCFA",16,9,677554341
12/4/2023,FAI R(FR),23,12/11/2023,12/21/2023,12/24/2023,"4,600 FCFA","4,600 FCFA",22,16,
12/4/2023,MR SONG(SN),64,12/11/2023,12/21/2023,12/24/2023,"8,600 FCFA","8,600 FCFA",56,43,
12/6/2023,MR TASSA(GT),26,12/13/2023,12/23/2023,12/26/2023,"5,200 FCFA","5,200 FCFA",,,
12/8/2023,NDAH SIMON(NS),109,12/15/2023,12/25/2023,12/28/2023,"14,200 FCFA","14,200 FCFA",88,71,
12/8/2023,KIMBENG J(KJ),12,12/15/2023,12/25/2023,12/28/2023,"2,400 FCFA","2,400 FCFA",11,10,
12/11/2023,NAPOLEON(MF),10,12/18/2023,12/28/2023,12/31/2023,"2,000 FCFA","2,000 FCFA",9,7,
12/15/2023,AMBE(AN),12,12/22/2023,1/1/2024,1/4/2024,"2,400 FCFA","2,400 FCFA",8,8,
12/17/2023,NDAH SIMON(NS),117,12/24/2023,1/3/2024,1/6/2024,"13,600 FCFA","13,600 FCFA",90,68,
12/21/2023,FAI R(FR),30,12/28/2023,1/7/2024,1/10/2024,"6,000 FCFA","6,000 FCFA",20,12,
12/21/2023,FELIX BABS(F),12,12/28/2023,1/7/2024,1/10/2024,"2,400 FCFA","2,400 FCFA",12,11,674628930
12/23/2023,MR SONG(SN),68,12/30/2023,1/9/2024,1/12/2024,"6,800 FCFA","6,800 FCFA",50,34,
12/24/2023,NDAH SIMON(NS),134,12/31/2023,1/10/2024,1/13/2024,"15,800 FCFA","15,800 FCFA",104,79,
12/28/2023,MENDONG(MR),7,1/4/2024,1/14/2024,1/17/2024,"1,400 FCFA","1,400 FCFA",5,5,
12/29/2023,TASA G(TG),60,1/5/2024,1/15/2024,1/18/2024,"12,000 FCFA","12,000 FCFA",44,44,
12/29/2023,STEPHANY(ST),5,1/5/2024,1/15/2024,1/18/2024,"1,000 FCFA","1,000 FCFA",5,5,6721067907
12/24/2023,APAWA RAPHEAL(RF),8,12/31/2023,1/10/2024,1/13/2024,"1,600 FCFA","1,600 FCFA",8,4,
1/1/2024,APAWA RAPHEAL(RF),4,1/8/2024,1/18/2024,1/21/2024,800 FCFA,800 FCFA,2,2,
1/1/2024,MR SONG(SN),57,1/8/2024,1/18/2024,1/21/2024,"4,000 FCFA","4,000 FCFA",32,20,
1/2/2024,MBAKU(M),18,1/9/2024,1/19/2024,1/22/2024,"3,600 FCFA","3,600 FCFA",1,1,650938318
1/2/2024,NDAH SIMON(NS),100,1/9/2024,1/19/2024,1/22/2024,"13,000 FCFA","13,000 FCFA",87,65,
1/3/2024,ARREY ANDREAS(AA),8,1/10/2024,1/20/2024,1/23/2024,"1,600 FCFA","1,600 FCFA",3,3,
1/9/2024,NDAH SIMON(NS),102,1/16/2024,1/26/2024,1/29/2024,"15,800 FCFA","15,800 FCFA",80,79,
1/10/2024,BABEY(BB),15,1/17/2024,1/27/2024,1/30/2024,"3,000 FCFA","3,000 FCFA",10,10,
1/12/2024,STEPHANY(ST),5,1/19/2024,1/29/2024,2/1/2024,"1,000 FCFA","1,000 FCFA",4,4,
1/14/2024,NDAH SIMON(NS),92,1/21/2024,1/31/2024,2/3/2024,"15,400 FCFA","15,400 FCFA",80,77,
1/15/2024,ANGEL EKE (AE),15,1/22/2024,2/1/2024,2/4/2024,"3,000 FCFA","3,000 FCFA",13,12,674887483
1/15/2024,NDAH SIMON(NS),23,1/22/2024,2/1/2024,2/4/2024,"3,000 FCFA","3,000 FCFA",20,15,
1/16/2024,ARREY ANDREAS(AA),12,1/23/2024,2/2/2024,2/5/2024,"2,400 FCFA","2,400 FCFA",3,3,
1/20/2024,NDAH SIMON(NS),110,1/27/2024,2/6/2024,2/9/2024,"15,600 FCFA","15,600 FCFA",93,78,
1/20/2024,BABEY (BB),16,1/27/2024,2/6/2024,2/9/2024,"3,200 FCFA","3,000 FCFA",16,13,
1/21/2024,GALINE M (GM),9,1/28/2024,2/7/2024,2/10/2024,"1,800 FCFA","1,800 FCFA",9,9,
1/22/2024,ANGEL EKE (AE),20,1/29/2024,2/8/2024,2/11/2024,"4,000 FCFA","4,000 FCFA",19,17,
1/23/2024,JOE NDEPOH(JN),45,1/30/2024,2/9/2024,2/12/2024,"5,200 FCFA","5,200 FCFA",26,26,
1/23/2024,JOE NDEPOH(JN),12,1/30/2024,2/9/2024,2/12/2024,"1,200 FCFA","1,200 FCFA",6,6,
1/24/2024,ARREY ANDREAS(AA),17,1/31/2024,2/10/2024,2/13/2024,"3,400 FCFA",500 FCFA,5,5,
1/26/2024,NDAH SIMON(NS),119,2/2/2024,2/12/2024,2/15/2024,"17,400 FCFA","17,400 FCFA",103,87,
1/28/2024,JOE NDEPOH(JN),70,2/4/2024,2/14/2024,2/17/2024,"8,600 FCFA","8,600 FCFA",43,43,
1/27/2024,DONALD(DF),11,2/3/2024,2/13/2024,2/16/2024,"2,200 FCFA","2,200 FCFA",5,5,
1/27/2024,GALINE M (GM),10,2/3/2024,2/13/2024,2/16/2024,"2,000 FCFA","2,000 FCFA",10,8,
2/1/2024,NDAH SIMON(NS),115,2/8/2024,2/18/2024,2/21/2024,"11,800 FCFA","11,800 FCFA",85,59,
2/2/2024,JOE NDEPOH(JN),66,2/9/2024,2/19/2024,2/22/2024,"6,200 FCFA","6,200 FCFA",50,31,
2/2/2024,MR SONG(SN),77,2/9/2024,2/19/2024,2/22/2024,"7,200 FCFA","7,200 FCFA",45,36,
2/3/2024,DONALD(DF),5,2/10/2024,2/20/2024,2/23/2024,"1,000 FCFA","1,000 FCFA",4,2,
2/3/2024,BABEY(BB),8,2/10/2024,2/20/2024,2/23/2024,"1,600 FCFA","1,600 FCFA",7,5,
2/7/2024,NDAH SIMON(NS),148,2/14/2024,2/24/2024,2/27/2024,"9,000 FCFA","9,000 FCFA",91,45,
2/7/2024,JOE NDEPOH(JN),60,2/14/2024,2/24/2024,2/27/2024,"6,400 FCFA","6,400 FCFA",41,32,
2/8/2024,FERDINAND(F),15,2/15/2024,2/25/2024,2/28/2024,"3,000 FCFA","3,000 FCFA",12,6,
2/11/2024,MR SONG(SN),72,2/18/2024,2/28/2024,3/2/2024,"4,000 FCFA","4,000 FCFA",51,20,
2/12/2024,STEPHANY(ST),5,2/19/2024,2/29/2024,3/3/2024,"1,000 FCFA","1,000 FCFA",5,0,
2/12/2024,ANGEL EKE (AE),17,2/19/2024,2/29/2024,3/3/2024,"3,400 FCFA","3,400 FCFA",10,0,
2/12/2024,ARREY ANDREAS(AA),6,2/19/2024,2/29/2024,3/3/2024,"1,200 FCFA",0 FCFA,0,0,
2/13/2024,JOE NDEPOH(JN),35,2/20/2024,3/1/2024,3/4/2024,600 FCFA,600 FCFA,21,3,
2/13/2024,NDAH SIMON(NS),132,2/20/2024,3/1/2024,3/4/2024,"1,400 FCFA","1,400 FCFA",74,7,
2/13/2024,FERDINAND(F),15,2/20/2024,3/1/2024,3/4/2024,"3,000 FCFA","3,000 FCFA",14,0,
2/14/2024,T DESMOND(F1),7,2/21/2024,3/2/2024,3/5/2024,"1,400 FCFA","1,400 FCFA",0,0,
2/17/2024,ARREY ANDREAS(AA),9,2/24/2024,3/5/2024,3/8/2024,"1,800 FCFA","1,800 FCFA",0,0,
2/17/2024,STEPHANY(ST),3,2/24/2024,3/5/2024,3/8/2024,600 FCFA,600 FCFA,3,2,671089430
2/19/2024,AMBE(AN),15,2/26/2024,3/7/2024,3/10/2024,"3,000 FCFA","3,000 FCFA",8,6,
2/20/2024,FERDINAND(F),30,2/27/2024,3/8/2024,3/11/2024,"6,000 FCFA","6,000 FCFA",26,23,677078010
2/20/2024,JOE NDEPOH(JN),45,2/27/2024,3/8/2024,3/11/2024,"2,000 FCFA","2,000 FCFA",25,10,
2/18/2024,ARREY ANDREAS(AA),4,2/25/2024,3/6/2024,3/9/2024,800 FCFA,800 FCFA,2,2,
2/23/2024,NDAH SIMON(NS),188,3/1/2024,3/11/2024,3/14/2024,"12,000 FCFA","12,000 FCFA",92,60,
2/23/2024,ANONG MICHAEL(M),8,3/1/2024,3/11/2024,3/14/2024,"1,600 FCFA","1,000 FCFA",3,3,
2/24/2024,ARREY ANDREAS(AA),8,3/2/2024,3/12/2024,3/15/2024,"1,600 FCFA","1,500 FCFA",4,4,
2/26/2024,JOE NDEPOH(JN),46,3/4/2024,3/14/2024,3/17/2024,"4,200 FCFA","4,200 FCFA",32,21,
2/26/2024,AMBE(AN),10,3/4/2024,3/14/2024,3/17/2024,"2,000 FCFA","2,000 FCFA",10,8,
2/27/2024,FERDINAND(F),22,3/5/2024,3/15/2024,3/18/2024,"4,400 FCFA","4,400 FCFA",19,14,
2/20/2024,ANGEL EKE (AE),29,2/27/2024,3/8/2024,3/11/2024,"5,800 FCFA","5,800 FCFA",23,12,
3/1/2024,NDAH SIMON(NS),128,3/8/2024,3/18/2024,3/21/2024,"16,800 FCFA","16,800 FCFA",96,84,
3/2/2024,JOE NDEPOH(JN),46,3/9/2024,3/19/2024,3/22/2024,"7,400 FCFA","7,400 FCFA",39,37,
3/2/2024,ARREY ANDREAS(AA),10,3/9/2024,3/19/2024,3/22/2024,"2,000 FCFA","1,000 FCFA",8,5,
3/5/2024,FERDINAND(F),17,3/12/2024,3/22/2024,3/25/2024,"3,400 FCFA","3,400 FCFA",16,14,
3/5/2024,ANGEL EKE (AE),32,3/12/2024,3/22/2024,3/25/2024,"6,400 FCFA","6,400 FCFA",26,18,
3/5/2024,MR SONG(SN),68,3/12/2024,3/22/2024,3/25/2024,"9,200 FCFA","9,200 FCFA",52,46,
3/7/2024,NDAH SIMON(NS),113,3/14/2024,3/24/2024,3/27/2024,"17,800 FCFA","17,800 FCFA",99,89,
3/9/2024,Rapheal(RF),9,3/16/2024,3/26/2024,3/29/2024,"1,800 FCFA","1,800 FCFA",7,5,
3/10/2024,JOE NDEPOH(JN),72,3/17/2024,3/27/2024,3/30/2024,"9,200 FCFA","9,200 FCFA",51,46,
3/11/2024,ARREY ANDREAS(AA),7,3/18/2024,3/28/2024,3/31/2024,"1,400 FCFA","1,400 FCFA",7,5,
3/13/2024,AMBE(AN),14,3/20/2024,3/30/2024,4/2/2024,"2,800 FCFA","2,800 FCFA",13,11,
3/13/2024,NDAH SIMON(NS),118,3/20/2024,3/30/2024,4/2/2024,"10,800 FCFA","10,800 FCFA",101,54,
3/14/2024,MR SONG(SN),42,3/21/2024,3/31/2024,4/3/2024,"5,800 FCFA","5,800 FCFA",29,29,
3/15/2024,VALLEY(V),15,3/22/2024,4/1/2024,4/4/2024,"3,000 FCFA","3,000 FCFA",12,10,
3/16/2024,ARREY ANDREAS(AA),7,3/23/2024,4/2/2024,4/5/2024,"1,400 FCFA","1,000 FCFA",5,4,
3/17/2024,ANONG MICHAEL(M),7,3/24/2024,4/3/2024,4/6/2024,"1,400 FCFA","1,400 FCFA",5,4,
3/17/2024,JOE NDEPOH(JN),56,3/24/2024,4/3/2024,4/6/2024,"8,400 FCFA","8,400 FCFA",42,42,
3/20/2024,MAR GUET(GH),12,3/27/2024,4/6/2024,4/9/2024,"2,400 FCFA","2,400 FCFA",2,2,
3/20/2024,NDAH SIMON(NS),152,3/27/2024,4/6/2024,4/9/2024,"17,000 FCFA","17,000 FCFA",85,85,
3/22/2024,FABIAN HENRY(FH),18,3/29/2024,4/8/2024,4/11/2024,"3,600 FCFA","3,600 FCFA",14,13,
3/23/2024,JOE NDEPOH(JN),58,3/30/2024,4/9/2024,4/12/2024,"7,000 FCFA","7,000 FCFA",46,35,
3/23/2024,ARREY ANDREAS(AA),7,3/30/2024,4/9/2024,4/12/2024,"1,400 FCFA",,1,1,
3/27/2024,NDAH SIMON(NS),165,4/3/2024,4/13/2024,4/16/2024,"17,600 FCFA","17,600 FCFA",88,88,
3/28/2024,FABIAN HENRY(FH),10,4/4/2024,4/14/2024,4/17/2024,"2,000 FCFA","2,000 FCFA",9,9,
3/29/2024,AMBE(AN),11,4/5/2024,4/15/2024,4/18/2024,"2,200 FCFA","2,200 FCFA",10,10,
3/31/2024,JOE NDEPOH(JN),60,4/7/2024,4/17/2024,4/20/2024,"7,800 FCFA","7,800 FCFA",48,39,
4/1/2024,ANONG MICHAEL(M),5,4/8/2024,4/18/2024,4/21/2024,"1,000 FCFA",0 FCFA,0,0,
4/4/2024,SAKEM MOSES(S),7,4/11/2024,4/21/2024,4/24/2024,"1,400 FCFA",,6,5,
4/4/2024,NGU CELESTINE(NG),16,4/11/2024,4/21/2024,4/24/2024,"3,200 FCFA","3,200 FCFA",7,2,
4/4/2024,MR SONG(SN),32,4/11/2024,4/21/2024,4/24/2024,"3,600 FCFA","3,600 FCFA",26,18,
4/5/2024,PST KING(PS),14,4/12/2024,4/22/2024,4/25/2024,"2,800 FCFA","2,800 FCFA",2,2,
4/6/2024,AMBE(AN),10,4/13/2024,4/23/2024,4/26/2024,"2,000 FCFA","2,000 FCFA",10,8,
4/6/2024,ANGEL EKE (AE),15,4/13/2024,4/23/2024,4/26/2024,"3,000 FCFA","3,000 FCFA",11,6,
4/3/2024,ARREY ANDREAS(AA),10,4/10/2024,4/20/2024,4/23/2024,"2,000 FCFA",,4,3,
4/3/2024,GALINE M (GM),16,4/10/2024,4/20/2024,4/23/2024,"3,200 FCFA","3,200 FCFA",12,8,
4/3/2024,NDAH SIMON(NS),144,4/10/2024,4/20/2024,4/23/2024,"13,400 FCFA","13,400 FCFA",97,67,
4/7/2024,JOE NDEPOH(JN),76,4/14/2024,4/24/2024,4/27/2024,"13,600 FCFA","13,600 FCFA",71,68,
4/9/2024,FERDINAND(F),13,4/16/2024,4/26/2024,4/29/2024,"2,600 FCFA","2,600 FCFA",11,9,
4/9/2024,ARREY ANDREAS(AA),12,4/16/2024,4/26/2024,4/29/2024,"2,400 FCFA",,1,1,
4/9/2024,NGU CELESTINE(NG),7,4/16/2024,4/26/2024,4/29/2024,"1,400 FCFA","1,400 FCFA",7,5,
4/10/2024,NDAH SIMON(NS),137,4/17/2024,4/27/2024,4/30/2024,"13,000 FCFA","13,000 FCFA",75,65,
4/11/2024,FAI HALLEN(HF),5,4/18/2024,4/28/2024,5/1/2024,"1,000 FCFA","1,000 FCFA",2,1,
4/11/2024,FAI HALLEN(HF),10,4/18/2024,4/28/2024,5/1/2024,"2,000 FCFA","2,000 FCFA",4,4,
4/12/2024,PROMISE(P),5,4/19/2024,4/29/2024,5/2/2024,"1,000 FCFA","1,000 FCFA",4,2,677292843
4/12/2024,ANONG MICHAEL(M),5,4/19/2024,4/29/2024,5/2/2024,"1,000 FCFA","1,000 FCFA",0,0,
4/12/2024,SAKEM MOSES(S),8,4/19/2024,4/29/2024,5/2/2024,"1,600 FCFA","1,600 FCFA",8,6,
4/14/2024,JOE NDEPOH(JN),73,4/21/2024,5/1/2024,5/4/2024,"10,000 FCFA","10,000 FCFA",68,50,
4/17/2024,JUNIOR FUANYI(J),65,4/24/2024,5/4/2024,5/7/2024,"13,000 FCFA","13,000 FCFA",32,30,650425167
4/17/2024,NDAH SIMON(NS),131,4/24/2024,5/4/2024,5/7/2024,"18,000 FCFA","18,000 FCFA",104,90,
4/18/2024,FEDINAND(F),9,4/25/2024,5/5/2024,5/8/2024,"1,800 FCFA","1,800 FCFA",8,6,
4/20/2024,CHUNGONG ELVIS(CH),22,4/27/2024,5/7/2024,5/10/2024,"4,400 FCFA","4,400 FCFA",16,14,677515689
4/21/2024,NGU CELESTINE(NG),11,4/28/2024,5/8/2024,5/11/2024,"2,200 FCFA","2,200 FCFA",10,3,
4/21/2024,JOE NDEPOH(JN),68,4/28/2024,5/8/2024,5/11/2024,"9,200 FCFA","9,200 FCFA",58,46,
4/23/2024,CHUNGONG ELVIS(CH),20,4/30/2024,5/10/2024,5/13/2024,"4,000 FCFA","4,000 FCFA",17,14,
4/23/2024,SAKEM MOSES(S),9,4/30/2024,5/10/2024,5/13/2024,"1,800 FCFA","2,000 FCFA",8,8,
4/24/2024,JUNIOR FUANYI(J),67,5/1/2024,5/11/2024,5/14/2024,"13,400 FCFA","13,400 FCFA",23,20,
4/24/2024,NDAH SIMON(NS),146,5/1/2024,5/11/2024,5/14/2024,"17,000 FCFA","17,000 FCFA",108,85,
4/25/2024,CHUNGONG ELVIS(CH),12,5/2/2024,5/12/2024,5/15/2024,"2,400 FCFA","2,400 FCFA",8,6,
4/27/2024,ANGEL EKE (AE),9,5/4/2024,5/14/2024,5/17/2024,"1,800 FCFA","1,800 FCFA",7,6,
4/27/2024,PA ATABONG(AB),53,5/4/2024,5/14/2024,5/17/2024,"10,600 FCFA","10,000 FCFA",46,41,674214021
4/27/2024,FERDINAND(F),18,5/4/2024,5/14/2024,5/17/2024,"3,600 FCFA","3,600 FCFA",16,13,
4/27/2024,CHUNGONG ELVIS(CH),12,5/4/2024,5/14/2024,5/17/2024,"2,400 FCFA","2,400 FCFA",10,8,
4/28/2024,JOE NDEPOH(JN),52,5/5/2024,5/15/2024,5/18/2024,"7,200 FCFA","7,200 FCFA",44,36,
4/28/2024,Rapheal(RF),18,5/5/2024,5/15/2024,5/18/2024,"3,600 FCFA","3,600 FCFA",6,6,
4/29/2024,CHUKU JENNET(CJ),8,5/6/2024,5/16/2024,5/19/2024,"1,600 FCFA","1,600 FCFA",6,4,
4/30/2024,CHUNGONG ELVIS(CH),15,5/7/2024,5/17/2024,5/20/2024,"3,000 FCFA","3,000 FCFA",10,5,
5/1/2024,JUNIOR FUANYI(J),73,5/8/2024,5/18/2024,5/21/2024,"14,600 FCFA","14,600 FCFA",29,11,
5/1/2024,AMBE(AN),10,5/8/2024,5/18/2024,5/21/2024,"2,000 FCFA","2,000 FCFA",9,5,
5/1/2024,MBU ASAAH(A),6,5/8/2024,5/18/2024,5/21/2024,"1,200 FCFA","1,200 FCFA",5,3,654725838
5/1/2024,NDAH SIMON(NS),135,5/8/2024,5/18/2024,5/21/2024,"13,200 FCFA","13,200 FCFA",84,66,
5/2/2024,SAKEM MOSES(S),7,5/9/2024,5/19/2024,5/22/2024,"1,400 FCFA","1,400 FCFA",5,5,
5/3/2024,CHUKU JENNET(CJ),9,5/10/2024,5/20/2024,5/23/2024,"1,800 FCFA","1,800 FCFA",8,5,672015667
5/3/2024,PA ATABONG(AB),40,5/10/2024,5/20/2024,5/23/2024,"8,000 FCFA","8,000 FCFA",38,36,
5/5/2024,Rapheal(RF),7,5/12/2024,5/22/2024,5/25/2024,"1,400 FCFA","1,400 FCFA",6,3,
5/5/2024,MR SONG(SN),16,5/12/2024,5/22/2024,5/25/2024,0 FCFA,,,,`;

function parseDate(dateStr: string) {
  if (!dateStr || !dateStr.trim()) return '';
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const m = parts[0].padStart(2, '0');
    const d = parts[1].padStart(2, '0');
    const y = parts[2];
    return `${y}-${m}-${d}`;
  }
  return dateStr.trim();
}

function parseCurrency(str: string) {
  if (!str) return 0;
  const num = String(str).replace(/FCFA/gi, '').replace(/,/g, '').trim();
  const parsed = parseFloat(num);
  return isNaN(parsed) ? 0 : parsed;
}

function parseClient(raw: string) {
  let name = raw.trim();
  let mark = '';
  const match = raw.match(/^(.*?)\((.*?)\)$/);
  if (match) {
    name = match[1].trim();
    mark = match[2].trim().toUpperCase();
  }
  if (!mark) {
    const words = name.split(/\s+/);
    if (words.length >= 2) {
      mark = (words[0][0] + words[1][0]).toUpperCase();
    } else {
      mark = name.substring(0, 2).toUpperCase();
    }
  } else if (mark.length === 1) {
    const words = name.split(/\s+/);
    if (words.length >= 2) {
      mark = (words[0][0] + words[1][0]).toUpperCase();
    } else {
      mark = (name.substring(0, 2)).toUpperCase();
    }
  }
  return { name, mark };
}

async function main() {
  const dbPath = path.join(process.cwd(), 'data', 'db.json');
  let db: any = {};
  if (fs.existsSync(dbPath)) {
    try {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
      db = {};
    }
  }

  db.clients = [];
  db.incubator_records = [];

  const clientPhoneMap: Record<string, string> = {};

  const lines = csvData.trim().split('\n').slice(1);
  let addedCount = 0;

  lines.forEach((line) => {
    const cols: string[] = [];
    let inQuotes = false;
    let currentCol = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(currentCol);
        currentCol = '';
      } else {
        currentCol += char;
      }
    }
    cols.push(currentCol);

    if (cols.length < 3) return;

    const dateBroughtRaw = cols[0];
    const clientRaw = cols[1];
    const eggsCollectedRaw = cols[2];
    const day8DateRaw = cols[3];
    const day18DateRaw = cols[4];
    const day21DateRaw = cols[5];
    const amountDueRaw = cols[6];
    const amountPaidRaw = cols[7];
    const eggsAfterScanRaw = cols[8];
    const chicksHatchedRaw = cols[9];
    const phoneRaw = cols[10];

    if (!dateBroughtRaw || !clientRaw) return;

    const dateBrought = parseDate(dateBroughtRaw);
    const day8Date = parseDate(day8DateRaw);
    const day18Date = parseDate(day18DateRaw);
    const day21Date = parseDate(day21DateRaw);

    const { name: clientName, mark: clientMark } = parseClient(clientRaw);
    const eggsCollected = parseInt(eggsCollectedRaw, 10) || 0;
    const amountDue = parseCurrency(amountDueRaw);
    const amountPaid = parseCurrency(amountPaidRaw);

    const eggsAfterScan = eggsAfterScanRaw && eggsAfterScanRaw.trim() !== '' ? parseInt(eggsAfterScanRaw, 10) : null;
    const chicksHatched = chicksHatchedRaw && chicksHatchedRaw.trim() !== '' ? parseInt(chicksHatchedRaw, 10) : null;
    const clientPhone = phoneRaw ? phoneRaw.trim() : '';

    if (clientPhone) {
      clientPhoneMap[clientMark] = clientPhone;
    }

    let client = db.clients.find((c: any) => c.mark === clientMark || c.name.toLowerCase() === clientName.toLowerCase());
    if (!client) {
      client = {
        id: clientMark,
        name: clientName,
        mark: clientMark,
        phone: clientPhone || clientPhoneMap[clientMark] || '',
        overdraft: 0
      };
      db.clients.push(client);
    } else if (clientPhone && !client.phone) {
      client.phone = clientPhone;
    }

    const ratePerEgg = eggsCollected > 0 ? Math.round(amountDue / eggsCollected) : 200;

    const newRecord = {
      id: crypto.randomUUID(),
      clientId: client.id,
      clientName: clientName,
      clientMark: clientMark,
      clientPhone: client.phone || clientPhone || '',
      eggType: 'Brahma',
      dateBrought,
      day8Date,
      day18Date,
      day21Date,
      eggsCollected,
      specialCase: 'Standard',
      ratePerEgg: ratePerEgg || 200,
      amountDue,
      amountPaid,
      overdraftUsed: 0,
      eggsAfterScan: isNaN(eggsAfterScan as number) ? null : eggsAfterScan,
      chicksHatched: isNaN(chicksHatched as number) ? null : chicksHatched,
      notes: `Imported batch settings from farm records (${clientRaw})`
    };

    db.incubator_records.push(newRecord);
    addedCount++;
  });

  console.log(`Parsed ${addedCount} incubator batch records across ${db.clients.length} clients.`);

  // Write to local db.json
  const tmpFile = dbPath + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, dbPath);
  console.log('Successfully wrote to data/db.json');

  // Push to Firestore
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const fbApp = initializeApp(config);
      const firestoreDb = getFirestore(fbApp, config.firestoreDatabaseId || '(default)');
      const docRef = doc(firestoreDb, 'app_data', 'main');
      const sanitized = JSON.parse(JSON.stringify(db));
      await setDoc(docRef, sanitized);
      console.log('Successfully pushed database snapshot with incubator records and clients to Firebase Cloud Firestore!');
    } else {
      console.log('firebase-applet-config.json not found, skipping Firestore sync');
    }
  } catch (err) {
    console.error('Error uploading snapshot to Firestore:', err);
  }

  process.exit(0);
}

main();
