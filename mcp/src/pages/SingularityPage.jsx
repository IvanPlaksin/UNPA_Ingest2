
import { useParams } from 'react-router-dom';
import SingularityGraph from '../components/Singularity/SingularityGraph';

const SingularityPage = () => {
    const { id } = useParams();
    return (
        <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <SingularityGraph rootId={id} />
        </div>
    );
};

export default SingularityPage;
