import * as THREE from 'three';

const roundedShape=(w,h,r)=>{const s=new THREE.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);return s};
const plate=(w,h,r,d,mat)=>new THREE.Mesh(new THREE.ExtrudeGeometry(roundedShape(w,h,r),{depth:d,bevelEnabled:true,bevelSize:.045,bevelThickness:.045,bevelSegments:4}),mat);
const addPlanarScreenUVs=(geometry)=>{
 const position=geometry.attributes.position;
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(let i=0;i<position.count;i++){
  const x=position.getX(i),y=position.getY(i);
  minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
 }
 const width=Math.max(maxX-minX,1e-6),height=Math.max(maxY-minY,1e-6);
 const uv=new Float32Array(position.count*2);
 for(let i=0;i<position.count;i++){
  // The display mesh is already rotated to face the camera. Keep the capture's
  // horizontal orientation unchanged so text and icons are not mirrored.
  uv[i*2]=(position.getX(i)-minX)/width;
  uv[i*2+1]=(position.getY(i)-minY)/height;
 }
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
};

export function createIPhone17ProMaxModel(){
 const root=new THREE.Group();root.name='iphone-17-pro-max';
 const aluminum=new THREE.MeshPhysicalMaterial({color:0xb8b9b5,metalness:.88,roughness:.24,clearcoat:.25});
 const backGlass=new THREE.MeshPhysicalMaterial({color:0xc9c9c4,metalness:.05,roughness:.29,clearcoat:1,clearcoatRoughness:.18});
 const black=new THREE.MeshPhysicalMaterial({color:0x050609,metalness:.25,roughness:.16,clearcoat:1});
 const lensGlass=new THREE.MeshPhysicalMaterial({color:0x111022,metalness:.15,roughness:.04,transmission:.15,clearcoat:1});
 const frame=plate(3.02,6.2,.42,.3,aluminum);frame.position.z=-.15;frame.name='unibody-frame';root.add(frame);
 const rear=plate(2.82,5.96,.35,.07,backGlass);rear.position.z=.18;rear.name='rear-glass';root.add(rear);
 const cameraPlate=plate(2.84,2.32,.32,.13,aluminum);cameraPlate.position.set(0,1.78,.23);cameraPlate.name='camera-plateau';root.add(cameraPlate);
 // iPhone reference layout: two lenses stacked on the left, one lens centered to
 // the right, with flash/LiDAR/mic occupying the far-right service column.
 const lensPositions=[[-.96,2.50],[-.96,1.06],[-.20,1.78]];
 lensPositions.forEach(([x,y],i)=>{const assembly=new THREE.Group();assembly.name=`fusion-camera-${i+1}`;const ring=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.18,64),aluminum);ring.rotation.x=Math.PI/2;const bezel=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.205,64),black);bezel.rotation.x=Math.PI/2;const glass=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.215,64),lensGlass);glass.rotation.x=Math.PI/2;const iris=new THREE.Mesh(new THREE.CylinderGeometry(.075,.12,.225,48),new THREE.MeshPhysicalMaterial({color:i===2?0x17122a:0x0c1018,roughness:.08,metalness:.15}));iris.rotation.x=Math.PI/2;assembly.add(ring,bezel,glass,iris);assembly.position.set(x,y,.34);root.add(assembly)});
 const lidar=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.17,48),black);lidar.rotation.x=Math.PI/2;lidar.position.set(.96,1.06,.35);lidar.name='lidar-scanner';root.add(lidar);
 const flash=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.17,48),new THREE.MeshPhysicalMaterial({color:0xe8e1d2,emissive:0xffe8bd,emissiveIntensity:.2,roughness:.35}));flash.rotation.x=Math.PI/2;flash.position.set(.96,2.50,.35);flash.name='true-tone-flash';root.add(flash);
 const mic=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.17,20),black);mic.rotation.x=Math.PI/2;mic.position.set(.96,1.78,.35);mic.name='rear-microphone';root.add(mic);
 const logo=new THREE.Mesh(new THREE.CircleGeometry(.26,48),new THREE.MeshStandardMaterial({color:0xa3a4a0,metalness:.55,roughness:.32}));logo.scale.y=1.17;logo.position.set(0,-.72,.265);logo.name='rear-mark';root.add(logo);
 // The display sits directly on the front frame surface; keeping this within the
 // frame depth prevents the side silhouette from splitting into two slabs.
 const screen=plate(2.76,5.92,.34,.045,new THREE.MeshPhysicalMaterial({color:0x05070b,roughness:.05,clearcoat:1}));
 addPlanarScreenUVs(screen.geometry);
 screen.rotation.y=Math.PI;screen.position.z=-.205;screen.name='display-glass';root.add(screen);
 const island=plate(.74,.22,.11,.026,black);island.rotation.y=Math.PI;island.position.set(0,2.68,-.182);island.name='dynamic-island';root.add(island);
 [[1.535,.95,.05,.77,'side-button'],[-1.535,1.32,.05,.54,'action-button'],[-1.535,.5,.05,.94,'volume-controls']].forEach(([x,y,w,h,n])=>{const b=new THREE.Mesh(new THREE.BoxGeometry(.09,h,.1),aluminum);b.position.set(x,y,-.08);b.name=n;root.add(b)});
 [-1.14,1.14].forEach(x=>{const band=new THREE.Mesh(new THREE.BoxGeometry(.05,.15,.32),new THREE.MeshStandardMaterial({color:0x777b7d,roughness:.55}));band.position.set(x,3.08,0);band.name='antenna-band';root.add(band)});
 root.userData={model:'iPhone 17 Pro Max',source:'Apple official product imagery',explodable:true,components:root.children.map(x=>x.name),tick:(dt)=>{root.position.y=Math.sin(dt*.8)*.025}};return root;
}
