export const PARKING_INVENTORY_ID = 'PARKING-BOOKING';

export const inventory = [
 { id:'4236287000000034286', name:'CABIN (3 SEATER)', description:'Private cabin with 3 seats', rate:28500, unit:'pcs', type:'Service', status:'Active' },
 { id:'4236287000000043012', name:'Private office: 10 Seater office', description:'Includes 3-seater manager cabin and 7 employee seats', rate:95000, unit:'pcs', type:'Service', status:'Active' },
 { id:'4236287000000043025', name:'Private Office: 23 Seater', description:'19 employee chairs and 4-seater manager cabin', rate:218500, unit:'pcs', type:'Service', status:'Active' },
 { id:'4236287000000043038', name:'Conference Room — Non Member', description:'One session = 4 hours', rate:4999, unit:'session', type:'Service', status:'Active' },
 { id:'4236287000000043046', name:'Conference Room — NanoSpace Member', description:'For NanoSpace members, prior booking required', rate:599, unit:'session', type:'Service', status:'Active' },
 { id:'4236287000000043054', name:'Manager Cabin: 4 Seater', description:'Private manager cabin for 4 people', rate:38000, unit:'pcs', type:'Service', status:'Active' },
 { id:'4236287000000043062', name:'Podcast Room — Non Member', description:'Podcast room rental for non-members', rate:999, unit:'session', type:'Service', status:'Active' },
 { id:'4236287000000043075', name:'Podcast Room — Member', description:'Podcast room rental for members', rate:599, unit:'session', type:'Service', status:'Active' },
 { id:'4236287000000043083', name:'Coworking Hot Seat — Per Month', description:'First-come, first-served hot desk membership', rate:8500, unit:'month', type:'Service', status:'Active' },
 { id:'4236287000000043091', name:'Coworking Hot Seat — Per Day', description:'Day pass for a hot seat', rate:499, unit:'day', type:'Service', status:'Active' },
 { id:'4236287000000054011', name:'Dedicated Seat (Inside Cabin)', description:'Dedicated seat inside a private office', rate:9500, unit:'month', type:'Service', status:'Active' },
 { id:PARKING_INVENTORY_ID, name:'Car Parking', description:'Optional car parking add-on, billed once per booking', rate:3000, unit:'booking', type:'Add-on', status:'Active' }
];
export const demoCustomers = [
 { id:'CUS-1001', name:'Rahul Sharma', email:'rahul.sharma@example.com', phone:'+91 98765 43210', company:'Rahul Consulting', branch:'Nanakramguda' },
 { id:'CUS-1002', name:'Mira Tech Pvt Ltd', email:'admin@miratech.example', phone:'+91 98480 12345', company:'Mira Tech Pvt Ltd', branch:'KPHB' },
 { id:'CUS-1003', name:'Aarav Consulting', email:'aarav@example.com', phone:'+91 90000 11122', company:'Aarav Consulting', branch:'Jubilee Hills' },
 { id:'CUS-1004', name:'Nexa Labs', email:'ops@nexalabs.example', phone:'+91 91234 56780', company:'Nexa Labs', branch:'Kokapet' },
 { id:'CUS-1005', name:'Sana Innovations', email:'hello@sanainnovations.example', phone:'+91 99887 77665', company:'Sana Innovations', branch:'Nanakramguda' }
];
export const branchFloors = {
 'KPHB': [{name:'Ground Floor', code:'G', seats:24},{name:'First Floor',code:'1',seats:32},{name:'Second Floor',code:'2',seats:30}],
 'Nanakramguda': [{name:'Ground Floor',code:'G',seats:32},{name:'First Floor',code:'1',seats:40},{name:'Second Floor',code:'2',seats:40}],
 'Jubilee Hills': [{name:'Ground Floor',code:'G',seats:24},{name:'First Floor',code:'1',seats:22},{name:'Second Floor',code:'2',seats:18}],
 'Kokapet': [{name:'Ground Floor',code:'G',seats:20},{name:'First Floor',code:'1',seats:18},{name:'Second Floor',code:'2',seats:14}]
};
