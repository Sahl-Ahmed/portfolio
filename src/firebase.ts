import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore,
  memoryLocalCache,
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  collection, 
  getDocFromServer,
  addDoc
} from 'firebase/firestore';
import firebaseConfig from './firebase-config.json';
import { Project, Achievement, Education, SkillItem, SocialLink, SectionTexts, Experience, Service } from './types';

const app = initializeApp(firebaseConfig);
const dbId = (firebaseConfig as any).firestoreDatabaseId;
export const db = dbId 
  ? initializeFirestore(app, { localCache: memoryLocalCache(), experimentalForceLongPolling: true }, dbId)
  : initializeFirestore(app, { localCache: memoryLocalCache(), experimentalForceLongPolling: true });
export const auth = getAuth();

// Validate Connection to Firestore on startup as mandated by Firebase Skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'settings', 'connection_test'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration: Client is offline.");
    }
  }
}
testConnection();

// Helper to recursively remove undefined values from objects before writing to Firestore
export function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item)) as any;
  }
  if (typeof obj === 'object') {
    const res: any = {};
    for (const key of Object.keys(obj as any)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        res[key] = cleanUndefined(val);
      }
    }
    return res;
  }
  return obj;
}

// Structured Error Handling as mandated by Firebase Skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Details: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Collections helpers

// 1. Projects
export async function dbGetProjects(): Promise<Project[]> {
  const colPath = 'projects';
  try {
    const querySnapshot = await getDocs(collection(db, colPath));
    const list: Project[] = [];
    querySnapshot.forEach((docSnap) => {
      list.push(docSnap.data() as Project);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function dbSaveProject(project: Project): Promise<void> {
  const docPath = `projects/${project.id}`;
  try {
    await setDoc(doc(db, 'projects', project.id), cleanUndefined(project));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function dbDeleteProject(projectId: string): Promise<void> {
  const docPath = `projects/${projectId}`;
  try {
    await deleteDoc(doc(db, 'projects', projectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// 2. Achievements
export async function dbGetAchievements(): Promise<Achievement[]> {
  const colPath = 'achievements';
  try {
    const querySnapshot = await getDocs(collection(db, colPath));
    const list: Achievement[] = [];
    querySnapshot.forEach((docSnap) => {
      list.push(docSnap.data() as Achievement);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function dbSaveAchievement(achievement: Achievement): Promise<void> {
  const docPath = `achievements/${achievement.id}`;
  try {
    await setDoc(doc(db, 'achievements', achievement.id), cleanUndefined(achievement));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function dbDeleteAchievement(id: string): Promise<void> {
  const docPath = `achievements/${id}`;
  try {
    await deleteDoc(doc(db, 'achievements', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// 3. Education
export async function dbGetEducation(): Promise<Education[]> {
  const colPath = 'education';
  try {
    const querySnapshot = await getDocs(collection(db, colPath));
    const list: Education[] = [];
    querySnapshot.forEach((docSnap) => {
      list.push(docSnap.data() as Education);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function dbSaveEducation(edu: Education): Promise<void> {
  const docPath = `education/${edu.id}`;
  try {
    await setDoc(doc(db, 'education', edu.id), cleanUndefined(edu));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function dbDeleteEducation(id: string): Promise<void> {
  const docPath = `education/${id}`;
  try {
    await deleteDoc(doc(db, 'education', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// 4. Skills
export async function dbGetSkills(): Promise<SkillItem[]> {
  const colPath = 'skills';
  try {
    const querySnapshot = await getDocs(collection(db, colPath));
    const list: SkillItem[] = [];
    querySnapshot.forEach((docSnap) => {
      list.push(docSnap.data() as SkillItem);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function dbSaveSkill(skill: SkillItem): Promise<void> {
  const docId = skill.name.replace(/[^a-zA-Z0-9]/g, '_');
  const docPath = `skills/${docId}`;
  try {
    await setDoc(doc(db, 'skills', docId), cleanUndefined(skill));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function dbDeleteSkill(name: string): Promise<void> {
  const docId = name.replace(/[^a-zA-Z0-9]/g, '_');
  const docPath = `skills/${docId}`;
  try {
    await deleteDoc(doc(db, 'skills', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// 5. Social Links
export async function dbGetSocials(): Promise<SocialLink[]> {
  const colPath = 'socials';
  try {
    const querySnapshot = await getDocs(collection(db, colPath));
    const list: SocialLink[] = [];
    querySnapshot.forEach((docSnap) => {
      list.push(docSnap.data() as SocialLink);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function dbSaveSocial(social: SocialLink): Promise<void> {
  const docPath = `socials/${social.id}`;
  try {
    await setDoc(doc(db, 'socials', social.id), cleanUndefined(social));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function dbDeleteSocial(id: string): Promise<void> {
  const docPath = `socials/${id}`;
  try {
    await deleteDoc(doc(db, 'socials', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// 6. Section Texts
export async function dbGetSectionTexts(): Promise<any | null> {
  const docPath = 'settings/section_texts';
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'section_texts'));
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function dbSaveSectionTexts(texts: any): Promise<void> {
  const docPath = 'settings/section_texts';
  try {
    await setDoc(doc(db, 'settings', 'section_texts'), cleanUndefined(texts));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// 7. Categories
export async function dbGetCategories(): Promise<string[] | null> {
  const docPath = 'settings/categories';
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'categories'));
    if (docSnap.exists()) {
      return docSnap.data().list || null;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function dbSaveCategories(list: string[]): Promise<void> {
  const docPath = 'settings/categories';
  try {
    await setDoc(doc(db, 'settings', 'categories'), cleanUndefined({ list }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// 8. Contact submissions logging
export async function dbSubmitContact(submission: {
  name: string;
  email: string;
  description: string;
  hireOption: string;
  createdAt: string;
}): Promise<void> {
  const id = `sub-${Date.now()}`;
  const docPath = `submissions/${id}`;
  try {
    await setDoc(doc(db, 'submissions', id), cleanUndefined(submission));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// 9. Global Views Counter
export async function dbGetViews(): Promise<number> {
  const docPath = 'settings/views_counter';
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'views_counter'));
    if (docSnap.exists()) {
      return docSnap.data().count || 1420;
    }
    return 1420;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function dbIncrementViews(currentCount: number): Promise<void> {
  const docPath = 'settings/views_counter';
  try {
    await setDoc(doc(db, 'settings', 'views_counter'), { count: currentCount + 1 });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// 10. Hero (Single doc: hero/info)
export async function dbSaveHero(heroData: any): Promise<void> {
  const docPath = 'hero/info';
  try {
    await setDoc(doc(db, 'hero', 'info'), cleanUndefined(heroData));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function dbGetHero(): Promise<any | null> {
  const docPath = 'hero/info';
  try {
    const docSnap = await getDoc(doc(db, 'hero', 'info'));
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

// 11. About (Single doc: about/info)
export async function dbSaveAbout(aboutData: any): Promise<void> {
  const docPath = 'about/info';
  try {
    await setDoc(doc(db, 'about', 'info'), cleanUndefined(aboutData));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function dbGetAbout(): Promise<any | null> {
  const docPath = 'about/info';
  try {
    const docSnap = await getDoc(doc(db, 'about', 'info'));
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

// 12. Experience
export async function dbGetExperience(): Promise<Experience[]> {
  const colPath = 'experience';
  try {
    const querySnapshot = await getDocs(collection(db, colPath));
    const list: Experience[] = [];
    querySnapshot.forEach((docSnap) => {
      list.push(docSnap.data() as Experience);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function dbSaveExperience(exp: Experience): Promise<void> {
  const docPath = `experience/${exp.id}`;
  try {
    await setDoc(doc(db, 'experience', exp.id), cleanUndefined(exp));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function dbDeleteExperience(id: string): Promise<void> {
  const docPath = `experience/${id}`;
  try {
    await deleteDoc(doc(db, 'experience', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// 13. Services
export async function dbGetServices(): Promise<Service[]> {
  const colPath = 'services';
  try {
    const querySnapshot = await getDocs(collection(db, colPath));
    const list: Service[] = [];
    querySnapshot.forEach((docSnap) => {
      list.push(docSnap.data() as Service);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function dbSaveService(service: Service): Promise<void> {
  const docPath = `services/${service.id}`;
  try {
    await setDoc(doc(db, 'services', service.id), cleanUndefined(service));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function dbDeleteService(id: string): Promise<void> {
  const docPath = `services/${id}`;
  try {
    await deleteDoc(doc(db, 'services', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// 14. Gallery
export async function dbGetGalleryItems(): Promise<Project[]> {
  const colPath = 'gallery';
  try {
    const querySnapshot = await getDocs(collection(db, colPath));
    const list: Project[] = [];
    querySnapshot.forEach((docSnap) => {
      list.push(docSnap.data() as Project);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function dbSaveGalleryItem(item: Project): Promise<void> {
  const docPath = `gallery/${item.id}`;
  try {
    await setDoc(doc(db, 'gallery', item.id), cleanUndefined(item));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function dbDeleteGalleryItem(id: string): Promise<void> {
  const docPath = `gallery/${id}`;
  try {
    await deleteDoc(doc(db, 'gallery', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// 15. addDoc based creators for autogenerated IDs
export async function dbAddProject(project: Omit<Project, 'id'> & { id?: string }): Promise<string> {
  const colPath = 'projects';
  try {
    const docRef = await addDoc(collection(db, 'projects'), cleanUndefined(project));
    await setDoc(doc(db, 'projects', docRef.id), cleanUndefined({ ...project, id: docRef.id }), { merge: true });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, colPath);
  }
}

export async function dbAddGalleryItem(item: Omit<Project, 'id'> & { id?: string }): Promise<string> {
  const colPath = 'gallery';
  try {
    const docRef = await addDoc(collection(db, 'gallery'), cleanUndefined(item));
    await setDoc(doc(db, 'gallery', docRef.id), cleanUndefined({ ...item, id: docRef.id }), { merge: true });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, colPath);
  }
}

export async function dbAddAchievement(ach: Omit<Achievement, 'id'> & { id?: string }): Promise<string> {
  const colPath = 'achievements';
  try {
    const docRef = await addDoc(collection(db, 'achievements'), cleanUndefined(ach));
    await setDoc(doc(db, 'achievements', docRef.id), cleanUndefined({ ...ach, id: docRef.id }), { merge: true });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, colPath);
  }
}

