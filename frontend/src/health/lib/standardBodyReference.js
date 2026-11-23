// Height- and sex-based *standard* body, not a measured population average.
// Conventions used by Korean clinics and body-composition result sheets:
//  - standard weight = height(m)² × BMI 22 (male) / 21 (female)
//  - standard body-fat percentage = 15 % (male) / 23 % (female)
// Skeletal muscle is not given by these conventions, so the standard body keeps the
// user's own measured muscle share of fat-free mass and applies it to the standard
// fat-free mass. Without that measurement no standard muscle value is shown.
export const STANDARD_BODY=Object.freeze({
 label:'표준 체형',
 bmi:{male:22,female:21},
 bodyFatPercent:{male:15,female:23},
 basis:'표준체중(키² × BMI 남 22·여 21)과 표준 체지방률(남 15%·여 23%)을 적용한 관례적 기준입니다. 실제 인구 평균이나 건강 판정 기준이 아닙니다.',
});
const round=(v,d=1)=>Math.round(v*10**d)/10**d;
export function standardBodyReference(measurement,profile={}){
 const gender=profile.gender,height=measurement?.height||profile.height_cm;
 const missing=[...(!['male','female'].includes(gender)?['성별']:[]),...(!(Number.isFinite(height)&&height>0)?['키']:[])];
 if(missing.length)return {available:false,missing,label:STANDARD_BODY.label,reason:`프로필에 ${missing.join('·')}을 저장하면 같은 키·성별의 표준 체형을 겹쳐 볼 수 있습니다.`};
 const weight=round(STANDARD_BODY.bmi[gender]*(height/100)**2),bodyFat=STANDARD_BODY.bodyFatPercent[gender];
 const leanMass=weight*(1-bodyFat/100);
 const ownWeight=measurement?.weight,ownFat=measurement?.body_fat_percentage,own=measurement?.skeletal_muscle_mass;
 const ownLean=Number.isFinite(ownWeight)&&Number.isFinite(ownFat)?ownWeight*(1-ownFat/100):null;
 const share=Number.isFinite(own)&&ownLean>0&&own<ownLean?own/ownLean:null;
 const value=share==null?null:round(leanMass*share);
 const comparable=value!=null;
 return {available:comparable,canOverlay:true,label:STANDARD_BODY.label,gender,height,weight,bodyFat,value,
  differenceKg:comparable?round(own-value,2):null,
  differencePercent:comparable?round((own-value)/value*100):null,
  muscleReason:comparable?null:'체중·체지방률·골격근량을 입력하면 표준 체형의 골격근량도 비교합니다.',
  measurement:{measurement_date:measurement?.measurement_date,height,weight,body_fat_percentage:bodyFat,...(comparable?{skeletal_muscle_mass:value}:{}),segments:[]},
 };
}
